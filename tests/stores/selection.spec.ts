import type { OpenDatabase } from '@/stores/vault'

import { showConfirmation } from '@nextcloud/dialogs'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useVaultStore } from '@/stores/vault'

vi.mock('@/services/webdav', () => ({ StorageError: class extends Error {}, createFile: vi.fn(), NextcloudFileStorage: class {} }))
vi.mock('@/services/api', () => ({
	DEFAULT_SETTINGS: { autosave: false, rememberKeyFile: false },
	getFileInfo: vi.fn(),
	getRecent: async () => [],
	touchRecent: async () => [],
	saveSettings: vi.fn(),
}))
vi.mock('@nextcloud/initial-state', () => ({ loadState: (_app: string, _key: string, fallback: unknown) => fallback }))
vi.mock('@nextcloud/dialogs', () => ({ showConfirmation: vi.fn(), showError: vi.fn(), showInfo: vi.fn(), showSuccess: vi.fn() }))
vi.mock('@/services/clipboard', () => ({ clearPendingSecret: vi.fn() }))
vi.mock('@/services/icons', () => ({ releaseIcons: vi.fn() }))
vi.mock('@/l10n', () => ({ t: (_app: string, text: string) => text }))

const confirmation = vi.mocked(showConfirmation)

/** A store with one active database showing the entry "entry-1" of "group-1". */
function editing(dirty: boolean) {
	const vault = useVaultStore()
	vault.databases.push({ id: '1', selectedGroup: 'group-1', selectedEntry: 'entry-1', query: 'git' } as OpenDatabase)
	vault.activeId = '1'
	vault.editorDirty = dirty
	return { vault, database: vault.databases[0]! }
}

describe('selectAsking', () => {
	beforeEach(() => {
		setActivePinia(createPinia())
		confirmation.mockReset()
	})

	it('selects without asking while the editor has no changes', async () => {
		const { vault, database } = editing(false)
		expect(await vault.selectAsking('1', { group: 'group-2', entry: null })).toBe(true)
		expect(confirmation).not.toHaveBeenCalled()
		expect(database).toMatchObject({ selectedGroup: 'group-2', selectedEntry: null, query: '' })
	})

	it('leaves everything as it was when the user keeps editing', async () => {
		const { vault, database } = editing(true)
		confirmation.mockResolvedValue(false)
		expect(await vault.selectAsking('1', { group: 'group-2', entry: null })).toBe(false)
		expect(database).toMatchObject({ selectedGroup: 'group-1', selectedEntry: 'entry-1', query: 'git' })
		expect(vault.editorDirty).toBe(true)
	})

	it('selects once the user discards the changes', async () => {
		const { vault, database } = editing(true)
		confirmation.mockResolvedValue(true)
		expect(await vault.selectAsking('1', { group: 'group-2', entry: 'entry-2' })).toBe(true)
		expect(database).toMatchObject({ selectedGroup: 'group-2', selectedEntry: 'entry-2' })
		expect(vault.editorDirty).toBe(false)
	})

	it('does not ask when the entry stays, or for a database in the background', async () => {
		const { vault, database } = editing(true)
		expect(await vault.selectAsking('1', { group: 'group-2' })).toBe(true)
		expect(await vault.selectAsking('1', { entry: 'entry-1' })).toBe(true)
		vault.databases.push({ id: '2', selectedGroup: null, selectedEntry: 'other', query: '' } as OpenDatabase)
		expect(await vault.selectAsking('2', { entry: null })).toBe(true)
		expect(confirmation).not.toHaveBeenCalled()
		expect(database.selectedEntry).toBe('entry-1')
	})
})
