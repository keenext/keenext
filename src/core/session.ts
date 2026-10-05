import type { Kdbx, KdbxCredentials } from 'kdbxweb'

import { openDatabase, saveDatabase } from './database.ts'

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
	private savedRevision = 0
	private queue: Promise<unknown> = Promise.resolve()
	/** Key of the file as stored; differs from db.credentials after a master key change until the next save. */
	private storedCredentials: KdbxCredentials

	private constructor(
		readonly storage: DatabaseStorage,
		public db: Kdbx,
		private etag: string,
	) {
		this.storedCredentials = db.credentials
	}

	static async open(storage: DatabaseStorage, credentials: KdbxCredentials): Promise<DatabaseSession> {
		const file = await storage.read()
		const db = await openDatabase(file.data, credentials)
		return new DatabaseSession(storage, db, file.etag)
	}

	/** For a database created in memory and already written once. */
	static fromCreated(storage: DatabaseStorage, db: Kdbx, etag: string): DatabaseSession {
		return new DatabaseSession(storage, db, etag)
	}

	get dirty(): boolean {
		return this.revision !== this.savedRevision
	}

	get version(): string {
		return this.etag
	}

	markChanged(): void {
		this.revision++
	}

	/** Writes local changes; on conflict pulls, merges and retries. */
	save(): Promise<SyncResult> {
		return this.serialize(() => this.push())
	}

	/**
	 * Pulls remote changes if the file changed, then pushes local changes, if any.
	 * Used on focus/interval to pick up edits made elsewhere.
	 */
	sync(): Promise<SyncResult> {
		return this.serialize(async () => {
			const remote = await this.storage.read()
			if (remote.etag === this.etag) {
				return this.dirty ? this.push() : { pulled: false, pushed: false }
			}
			await this.integrate(remote)
			if (!this.dirty) {
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
			const data = await saveDatabase(this.db)
			try {
				const credentials = this.db.credentials
				const { etag } = await this.storage.write(data, this.etag)
				this.etag = etag
				this.storedCredentials = credentials
				this.savedRevision = revision
				this.db.removeLocalEditState()
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
		const remoteDb = await openDatabase(remote.data, this.storedCredentials)
		if (this.dirty) {
			this.db.merge(remoteDb)
		} else {
			this.db = remoteDb
			this.savedRevision = this.revision + 1
		}
		this.etag = remote.etag
		this.revision++
	}
}
