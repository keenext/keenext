import type { Kdbx, KdbxCredentials, KdbxHeader } from 'kdbxweb'
import type { KdfLimits, OpenOptions } from './database.ts'

import { DatabaseOpenError, DEFAULT_KDF_LIMITS, encryptionSettings, getKdf, kdfLimitsAllowing, openDatabase, saveDatabase } from './database.ts'
import { removeDuplicates } from './repair.ts'

export interface StoredFile {
	data: ArrayBuffer
	/** Opaque version token; the storage rejects writes based on an outdated one. */
	etag: string
}

export interface DatabaseStorage {
	read(): Promise<StoredFile>
	/** Must throw `ConflictError` if the stored version is no longer `etag`. */
	write(data: ArrayBuffer, etag: string): Promise<{ etag: string }>
}

export class ConflictError extends Error {
	constructor(message = 'The file was changed by someone else') {
		super(message)
		this.name = 'ConflictError'
	}
}

export interface SyncResult {
	/** Remote changes were merged into (or replaced) the local copy. */
	pulled: boolean
	/** Local changes were written to the storage. */
	pushed: boolean
}

const MAX_CONFLICT_RETRIES = 3

/**
 * An open database bound to its storage. All writes go through `save`, which
 * merges remote changes (kdbxweb's CRDT merge) when the file changed meanwhile,
 * so concurrent edits from KeePassXC, the sync client or another tab are kept.
 *
 * Mutations of `db` must be followed by `markChanged()`; the revision counter is
 * what the UI and autosave observe.
 */
export class DatabaseSession {
	revision = 0
	/** Copies dropped by `removeDuplicates` (kdbxweb cannot merge such files); the repair counts as a change. */
	repairedDuplicates = 0
	private savedRevision = 0
	private queue: Promise<unknown> = Promise.resolve()
	/** Key of the file as stored; differs from db.credentials after a master key change until the next save. */
	private storedCredentials: KdbxCredentials
	/** `encryptionSettings` of the file as stored; tells which side changed them when merging. */
	private storedEncryption: string

	private constructor(
		readonly storage: DatabaseStorage,
		public db: Kdbx,
		private etag: string,
		/** Accepted when opening; remote versions may also use the local database's own key derivation. */
		private readonly kdfLimits: KdfLimits,
	) {
		this.storedCredentials = db.credentials
		this.storedEncryption = encryptionSettings(db.header)
	}

	static async open(storage: DatabaseStorage, credentials: KdbxCredentials, options: OpenOptions = {}): Promise<DatabaseSession> {
		const file = await storage.read()
		const db = await openDatabase(file.data, credentials, options)
		const session = new DatabaseSession(storage, db, file.etag, options.kdfLimits ?? DEFAULT_KDF_LIMITS)
		session.repairedDuplicates = removeDuplicates(db)
		if (session.repairedDuplicates > 0) {
			session.markChanged()
		}
		return session
	}

	/** For a database created in memory and already written once. */
	static fromCreated(storage: DatabaseStorage, db: Kdbx, etag: string): DatabaseSession {
		return new DatabaseSession(storage, db, etag, DEFAULT_KDF_LIMITS)
	}

	get dirty(): boolean {
		return this.revision !== this.savedRevision
	}

	markChanged(): void {
		this.revision++
	}

	/** Writes local changes, if any; on conflict pulls, merges and retries. */
	save(): Promise<SyncResult> {
		return this.serialize(async () => this.dirty ? this.push() : { pulled: false, pushed: false })
	}

	/**
	 * Pulls remote changes if the file changed, then pushes local changes, if any.
	 * Used on focus/interval to pick up edits made elsewhere. With `push: false`
	 * local changes are merged with the remote ones but stay unsaved.
	 */
	sync({ push = true }: { push?: boolean } = {}): Promise<SyncResult> {
		return this.serialize(async () => {
			const remote = await this.storage.read()
			if (remote.etag === this.etag) {
				return push && this.dirty ? this.push() : { pulled: false, pushed: false }
			}
			await this.integrate(remote)
			if (!push || !this.dirty) {
				return { pulled: true, pushed: false }
			}
			const result = await this.push()
			return { pulled: true, pushed: result.pushed }
		})
	}

	private serialize<T>(task: () => Promise<T>): Promise<T> {
		const run = this.queue.then(task, task)
		this.queue = run.catch(() => undefined)
		return run
	}

	private async push(): Promise<SyncResult> {
		let pulled = false
		for (let attempt = 0; attempt <= MAX_CONFLICT_RETRIES; attempt++) {
			const revision = this.revision
			const credentials = this.db.credentials
			const encryption = encryptionSettings(this.db.header)
			const data = await saveDatabase(this.db)
			try {
				const { etag } = await this.storage.write(data, this.etag)
				this.etag = etag
				this.storedCredentials = credentials
				this.storedEncryption = encryption
				this.savedRevision = revision
				// Edits made while this save was under way are not in the file yet. Their merge state
				// (history states deleted, limits changed) has to last until the save that writes them,
				// or a merge in between brings back what was deleted.
				if (this.revision === revision) {
					this.db.removeLocalEditState()
				}
				return { pulled, pushed: true }
			} catch (error) {
				if (!(error instanceof ConflictError)) {
					throw error
				}
				await this.integrate(await this.storage.read())
				pulled = true
			}
		}
		throw new ConflictError('The file keeps changing while saving; try again later')
	}

	/**
	 * Without local changes the remote copy replaces the local one (cheap, exact);
	 * otherwise it is merged in and the result counts as a local change.
	 */
	private async integrate(remote: StoredFile): Promise<void> {
		const remoteDb = await this.openRemote(remote)
		const repaired = removeDuplicates(remoteDb)
		this.repairedDuplicates += repaired
		if (this.dirty) {
			// Before merging: merge takes over the newer meta.settingsChanged.
			const header = this.mergedHeader(remoteDb)
			this.db.merge(remoteDb)
			this.db.header = header
		} else {
			this.db = remoteDb
			if (repaired === 0) {
				this.savedRevision = this.revision + 1
			}
		}
		this.etag = remote.etag
		this.storedEncryption = encryptionSettings(remoteDb.header)
		this.revision++
	}

	/**
	 * A save whose response got lost (timeout) may have stored the file with a new
	 * master key already; then only the new key opens it.
	 */
	private async openRemote(remote: StoredFile): Promise<Kdbx> {
		const options = { kdfLimits: kdfLimitsAllowing(getKdf(this.db), this.kdfLimits) }
		try {
			return await openDatabase(remote.data, this.storedCredentials, options)
		} catch (error) {
			if (!(error instanceof DatabaseOpenError && error.reason === 'invalid-key') || this.db.credentials === this.storedCredentials) {
				throw error
			}
			const remoteDb = await openDatabase(remote.data, this.db.credentials, options)
			this.storedCredentials = this.db.credentials
			return remoteDb
		}
	}

	/**
	 * kdbxweb's merge leaves the header alone, so saving would revert encryption settings
	 * changed elsewhere. The side that changed them since the stored version wins; if both
	 * did, the later change.
	 */
	private mergedHeader(remoteDb: Kdbx): KdbxHeader {
		const local = encryptionSettings(this.db.header)
		const remote = encryptionSettings(remoteDb.header)
		if (remote === local || remote === this.storedEncryption) {
			return this.db.header
		}
		if (local === this.storedEncryption) {
			return remoteDb.header
		}
		const localChanged = this.db.meta.settingsChanged?.getTime() ?? 0
		const remoteChanged = remoteDb.meta.settingsChanged?.getTime() ?? 0
		return localChanged > remoteChanged ? this.db.header : remoteDb.header
	}
}
