import type { Kdbx } from 'kdbxweb'
import type { Raw } from 'vue'
import type { CredentialsInput } from '@/core/database'
import type { RecentFile } from '@/services/api'

import { showError, showSuccess } from '@nextcloud/dialogs'
import { defineStore } from 'pinia'
import { computed, markRaw, ref } from 'vue'
import { useSettingsStore } from './settings.ts'
import { createCredentials, createDatabase, DatabaseOpenError, saveDatabase } from '@/core/database'
import { DatabaseSession } from '@/core/session'
import { t } from '@/l10n'
import { getFileInfo, getRecent, touchRecent } from '@/services/api'
import { clearPendingSecret } from '@/services/clipboard'
import { releaseIcons } from '@/services/icons'
import { createFile, NextcloudFileStorage, StorageError } from '@/services/webdav'

export interface OpenDatabase {
	/** String form of fileId; used as key and in the URL. */
	id: string
	fileId: number
	name: string
	path: string
	writable: boolean
	/** null while locked. Not reactive: kdbxweb objects are mutated in place. */
	session: Raw<DatabaseSession> | null
	/** Mirrors session.revision so views recompute after changes. */
	revision: number
	dirty: boolean
	saving: boolean
	/** Remembered key file for unlocking (Nextcloud file id). */
	keyFile: RecentFile['keyFile']
	selectedGroup: string | null
	selectedEntry: string | null
	query: string
}

export interface UnlockInput extends CredentialsInput {
	/** Set when the key file came from Nextcloud, so it can be remembered. */
	keyFileId?: number
}

const AUTOSAVE_DELAY = 1500

function describeError(error: unknown): string {
	if (error instanceof DatabaseOpenError) {
		switch (error.reason) {
			case 'invalid-key': return t('keenext', 'Wrong password or key file')
			case 'corrupt': return t('keenext', 'The file is not a valid KeePass database')
			case 'unsupported': return t('keenext', 'This database format is not supported')
		}
	}
	if (error instanceof StorageError) {
		switch (error.reason) {
			case 'forbidden': return t('keenext', 'You are not allowed to change this file')
			case 'not-found': return t('keenext', 'The file no longer exists')
			case 'locked': return t('keenext', 'The file is locked by another application')
			case 'exists': return t('keenext', 'A file with this name already exists')
		}
	}
	return error instanceof Error ? error.message : String(error)
}

export const useVaultStore = defineStore('vault', () => {
	const databases = ref<OpenDatabase[]>([])
	const activeId = ref<string | null>(null)
	const recent = ref<RecentFile[]>([])
	const autosaveTimers = new Map<string, ReturnType<typeof setTimeout>>()

	const active = computed(() => databases.value.find((database) => database.id === activeId.value) ?? null)
	const anyDirty = computed(() => databases.value.some((database) => database.dirty))

	function find(id: string): OpenDatabase {
		const database = databases.value.find((candidate) => candidate.id === id)
		if (!database) {
			throw new Error(`Database ${id} is not open`)
		}
		return database
	}

	/** Copies session state into the reactive record after anything that may change it. */
	function refresh(database: OpenDatabase): void {
		if (database.session) {
			database.revision = database.session.revision
			database.dirty = database.session.dirty
			const storage = database.session.storage
			if (storage instanceof NextcloudFileStorage) {
				database.path = storage.currentPath
				database.name = storage.currentPath.split('/').pop() ?? database.name
			}
		}
	}

	async function loadRecent(): Promise<void> {
		try {
			recent.value = await getRecent()
		} catch (error) {
			showError(t('keenext', 'Could not load recent databases: {error}', { error: describeError(error) }))
		}
	}

	/** Adds a (locked) tab for the file, or switches to it if already open. */
	async function openFile(fileId: number): Promise<void> {
		const id = String(fileId)
		if (databases.value.some((database) => database.id === id)) {
			activeId.value = id
			return
		}
		const info = await getFileInfo(fileId)
		const remembered = recent.value.find((file) => file.fileId === fileId)
		databases.value.push({
			id,
			fileId,
			name: info.name,
			path: info.path,
			writable: info.writable,
			session: null,
			revision: 0,
			dirty: false,
			saving: false,
			keyFile: remembered?.keyFile ?? null,
			selectedGroup: null,
			selectedEntry: null,
			query: '',
		})
		activeId.value = id
	}

	async function unlock(id: string, input: UnlockInput): Promise<void> {
		const database = find(id)
		const storage = new NextcloudFileStorage(database.fileId, database.path)
		const session = await DatabaseSession.open(storage, createCredentials(input))
		database.session = markRaw(session)
		database.selectedGroup ??= session.db.getDefaultGroup().uuid.id
		refresh(database)

		const { settings } = useSettingsStore()
		const keyFileId = settings.rememberKeyFile ? (input.keyFileId ?? null) : null
		touchRecent(database.fileId, keyFileId)
			.then((files) => {
				recent.value = files
				database.keyFile = files.find((file) => file.fileId === database.fileId)?.keyFile ?? null
			})
			.catch(() => undefined)
	}

	/**
	 * Locks after saving pending changes. Returns false (and stays unlocked) if
	 * saving failed, so nothing is lost silently.
	 */
	async function lock(id: string): Promise<boolean> {
		const database = find(id)
		if (!database.session) {
			return true
		}
		if (database.session.dirty && !(await save(id))) {
			return false
		}
		clearTimeout(autosaveTimers.get(id))
		releaseIcons(database.session.db)
		database.session = null
		database.selectedEntry = null
		database.query = ''
		database.revision = 0
		clearPendingSecret()
		return true
	}

	async function lockAll(): Promise<void> {
		await Promise.all(databases.value.map((database) => lock(database.id)))
	}

	async function close(id: string): Promise<boolean> {
		if (!(await lock(id))) {
			return false
		}
		databases.value = databases.value.filter((database) => database.id !== id)
		if (activeId.value === id) {
			activeId.value = databases.value[0]?.id ?? null
		}
		return true
	}

	/** Selecting a group leaves search mode, like clicking a group in KeePassXC. */
	function select(id: string, selection: { group?: string | null, entry?: string | null }): void {
		const database = find(id)
		if (selection.group !== undefined) {
			database.selectedGroup = selection.group
			database.query = ''
		}
		if (selection.entry !== undefined) {
			database.selectedEntry = selection.entry
		}
	}

	function search(id: string, query: string): void {
		find(id).query = query
	}

	/**
	 * The only way views modify a database: runs `mutation`, records the change
	 * and schedules autosave.
	 */
	function change<T>(id: string, mutation: (db: Kdbx) => T): T {
		const database = find(id)
		if (!database.session) {
			throw new Error('Database is locked')
		}
		const result = mutation(database.session.db)
		database.session.markChanged()
		refresh(database)
		scheduleAutosave(database)
		return result
	}

	function scheduleAutosave(database: OpenDatabase): void {
		if (!useSettingsStore().settings.autosave || !database.writable) {
			return
		}
		clearTimeout(autosaveTimers.get(database.id))
		autosaveTimers.set(database.id, setTimeout(() => void save(database.id), AUTOSAVE_DELAY))
	}

	async function save(id: string): Promise<boolean> {
		const database = find(id)
		const session = database.session
		if (!session) {
			return false
		}
		clearTimeout(autosaveTimers.get(id))
		database.saving = true
		try {
			const result = await session.save()
			if (result.pulled) {
				showSuccess(t('keenext', 'Changes made elsewhere were merged into {name}', { name: database.name }))
			}
			return true
		} catch (error) {
			showError(t('keenext', 'Could not save {name}: {error}', { name: database.name, error: describeError(error) }))
			return false
		} finally {
			database.saving = false
			refresh(database)
		}
	}

	/** Picks up changes made elsewhere; silent unless something was merged. */
	async function sync(id: string): Promise<void> {
		const database = find(id)
		const session = database.session
		if (!session || database.saving) {
			return
		}
		try {
			const result = await session.sync()
			if (result.pulled && result.pushed) {
				showSuccess(t('keenext', 'Changes made elsewhere were merged into {name}', { name: database.name }))
			}
		} catch {
			// Polling is best-effort; explicit saves report errors.
		} finally {
			refresh(database)
		}
	}

	async function syncAll(): Promise<void> {
		await Promise.all(databases.value.filter((database) => database.session).map((database) => sync(database.id)))
	}

	async function create(options: { directory: string, name: string, credentials: UnlockInput }): Promise<void> {
		const fileName = options.name.endsWith('.kdbx') ? options.name : `${options.name}.kdbx`
		const title = fileName.replace(/\.kdbx$/, '')
		const path = `${options.directory.replace(/\/$/, '')}/${fileName}`
		const db = createDatabase(title, createCredentials(options.credentials))
		const { etag, fileId } = await createFile(path, await saveDatabase(db))
		const info = await getFileInfo(fileId)

		const id = String(fileId)
		const session = DatabaseSession.fromCreated(new NextcloudFileStorage(fileId, info.path), db, etag)
		databases.value.push({
			id,
			fileId,
			name: info.name,
			path: info.path,
			writable: info.writable,
			session: markRaw(session),
			revision: session.revision,
			dirty: false,
			saving: false,
			keyFile: null,
			selectedGroup: db.getDefaultGroup().uuid.id,
			selectedEntry: null,
			query: '',
		})
		activeId.value = id
		const { settings } = useSettingsStore()
		recent.value = await touchRecent(fileId, settings.rememberKeyFile ? (options.credentials.keyFileId ?? null) : null)
	}

	return {
		databases,
		activeId,
		active,
		anyDirty,
		recent,
		loadRecent,
		openFile,
		unlock,
		lock,
		lockAll,
		close,
		select,
		search,
		change,
		save,
		sync,
		syncAll,
		create,
		describeError,
	}
})
