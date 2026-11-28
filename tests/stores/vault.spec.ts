import type { Kdbx } from 'kdbxweb'

import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { entryByTitle, newDatabase } from '../helpers/databases.ts'
import { createCredentials, openDatabase, saveDatabase } from '@/core/database'
import { createEntry, emptyDraft } from '@/core/entries'
import { ConflictError } from '@/core/session'
import { useVaultStore } from '@/stores/vault'

/** The file behind the one database these tests open, in place of WebDAV. */
const file = vi.hoisted(() => ({
	data: new ArrayBuffer(0),
	version: 0,
	duringNextWrite: undefined as (() => void) | undefined,
}))

vi.mock('@/services/webdav', () => ({
	StorageError: class extends Error {},
	createFile: vi.fn(),
	NextcloudFileStorage: class {
		readonly currentPath = '/Test.kdbx'
		constructor(readonly fileId: number) {}

		async read() {
			return { data: file.data.slice(0), etag: `v${file.version}` }
		}

		async write(data: ArrayBuffer, etag: string) {
			if (etag !== `v${file.version}`) {
				throw new ConflictError()
			}
			file.duringNextWrite?.()
			file.duringNextWrite = undefined
			file.data = data.slice(0)
			file.version++
			return { etag: `v${file.version}` }
		}
	},
}))
vi.mock('@/services/api', () => ({
	DEFAULT_SETTINGS: { autosave: false, rememberKeyFile: false },
	getFileInfo: async (fileId: number) => ({ fileId, name: 'Test.kdbx', path: '/Test.kdbx', size: 0, mtime: 0, etag: '', writable: true }),
	getRecent: async () => [],
	touchRecent: async () => [],
	saveSettings: vi.fn(),
}))
vi.mock('@nextcloud/initial-state', () => ({ loadState: (_app: string, _key: string, fallback: unknown) => fallback }))
vi.mock('@nextcloud/dialogs', () => ({ showError: vi.fn(), showInfo: vi.fn(), showSuccess: vi.fn() }))
vi.mock('@/services/clipboard', () => ({ clearPendingSecret: vi.fn() }))
vi.mock('@/services/icons', () => ({ releaseIcons: vi.fn() }))
vi.mock('@/l10n', () => ({ t: (_app: string, text: string) => text }))

async function stored(): Promise<Kdbx> {
	return openDatabase(file.data.slice(0), createCredentials({ password: 'test' }))
}

async function unlocked() {
	const vault = useVaultStore()
	await vault.openFile(1)
	await vault.unlock('1', { password: 'test' })
	return vault
}

function addEntry(vault: ReturnType<typeof useVaultStore>, title: string): void {
	vault.change('1', (db) => createEntry(db, db.getDefaultGroup(), { ...emptyDraft(), title }))
}

describe('vault store: locking', () => {
	beforeEach(async () => {
		setActivePinia(createPinia())
		file.data = await saveDatabase(newDatabase())
		file.version = 0
		file.duringNextWrite = undefined
	})

	it('saves pending changes before locking', async () => {
		const vault = await unlocked()
		addEntry(vault, 'First')
		expect(await vault.lock('1')).toBe(true)
		expect(vault.databases[0]!.session).toBeNull()
		const db = await stored()
		expect(() => entryByTitle(db, 'First')).not.toThrow()
	})

	it('also saves a change made while the save before locking was under way', async () => {
		const vault = await unlocked()
		addEntry(vault, 'First')
		file.duringNextWrite = () => addEntry(vault, 'Second')
		expect(await vault.lock('1')).toBe(true)
		expect(vault.databases[0]!.session).toBeNull()
		const db = await stored()
		expect(() => entryByTitle(db, 'First')).not.toThrow()
		expect(() => entryByTitle(db, 'Second')).not.toThrow()
	})

	it('copes with two lock requests at once', async () => {
		const vault = await unlocked()
		addEntry(vault, 'First')
		expect(await Promise.all([vault.lock('1'), vault.lock('1')])).toEqual([true, true])
		expect(vault.databases[0]!.session).toBeNull()
	})
})
