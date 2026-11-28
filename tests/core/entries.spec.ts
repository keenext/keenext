import { ProtectedValue } from 'kdbxweb'
import { describe, expect, it } from 'vitest'
import { entryByTitle, newDatabase, openRichFixture } from '../helpers/databases.ts'
import { createCredentials, openDatabase, saveDatabase } from '@/core/database'
import {
	applyDraft,
	attachFile,
	attachmentData,
	changedFields,
	createEntry,
	deleteEntry,
	draftFromEntry,
	emptyDraft,
	excludedFromReports,
	fieldNameProblems,
	getField,
	isExpired,
	isInRecycleBin,
	isPasskeyField,
	readPasskey,
	recycleBin,
	restoreHistory,
} from '@/core/entries'
import { createGroup, deleteGroup, emptyRecycleBin, moveGroup } from '@/core/groups'

describe('reading a KeePassXC database', () => {
	it('exposes standard and custom fields as a draft', async () => {
		const db = await openRichFixture()
		const draft = draftFromEntry(entryByTitle(db, 'GitHub'))
		expect(draft).toMatchObject({
			title: 'GitHub',
			username: 'jan@example.org',
			password: 'gh-secret-2',
			url: 'https://github.com/login',
			notes: 'Zeile 1 mit Umlauten: äöüß\nZeile 2',
			tags: ['dev', 'work'],
			expires: null,
		})
		expect(draft.customFields).toContainEqual({ key: 'Recovery codes', value: 'aaaa-bbbb\ncccc-dddd', protected: true })
		expect(draft.customFields).toContainEqual({ key: 'KP2A_URL_1', value: 'https://gist.github.com', protected: false })
		expect(draft.attachments.map((attachment) => attachment.name)).toEqual(['notes.txt'])
		expect(new TextDecoder().decode(attachmentData(draft.attachments[0]!))).toBe('Hello attachment ✓\n')
	})

	it('knows expiry', async () => {
		const db = await openRichFixture()
		expect(isExpired(entryByTitle(db, 'Alte Karte (abgelaufen)'))).toBe(true)
		expect(isExpired(entryByTitle(db, 'Hausbank'), new Date('2025-01-01'))).toBe(false)
		expect(draftFromEntry(entryByTitle(db, 'Hausbank')).expires?.toISOString()).toBe('2030-12-31T23:00:00.000Z')
	})
})

describe('colors, health check and passkeys', () => {
	it('writes colors and the health check flag, and lists them as changes', () => {
		const db = newDatabase()
		const entry = db.createEntry(db.getDefaultGroup())
		const before = draftFromEntry(entry)
		expect(before).toMatchObject({ fgColor: null, bgColor: null, excludeFromReports: false })
		const after = { ...before, fgColor: '#aa0000', bgColor: '#ffffcc', excludeFromReports: true }
		expect(applyDraft(db, entry, after)).toBe(true)
		expect([entry.fgColor, entry.bgColor, entry.qualityCheck]).toEqual(['#aa0000', '#ffffcc', false])
		expect(changedFields(before, draftFromEntry(entry)).standard).toEqual(['color', 'healthCheck'])
		applyDraft(db, entry, { ...after, fgColor: null, excludeFromReports: false })
		expect([entry.fgColor, entry.qualityCheck]).toEqual([undefined, undefined])
	})

	it('reads KeePassXC\'s older KnownBad flag and drops it when the entry is included again', () => {
		const db = newDatabase()
		const entry = db.createEntry(db.getDefaultGroup())
		entry.customData = new Map([['KnownBad', { value: 'true' }], ['Other', { value: 'x' }]])
		expect(excludedFromReports(entry)).toBe(true)
		applyDraft(db, entry, { ...draftFromEntry(entry), excludeFromReports: false })
		expect(excludedFromReports(entry)).toBe(false)
		expect([...entry.customData.keys()]).toEqual(['Other'])
	})

	it('recognises KeePassXC passkeys', () => {
		const db = newDatabase()
		const entry = db.createEntry(db.getDefaultGroup())
		expect(readPasskey(entry)).toBeUndefined()
		entry.fields.set('KPEX_PASSKEY_RELYING_PARTY', 'example.org')
		entry.fields.set('KPEX_PASSKEY_USERNAME', 'jan')
		entry.fields.set('KPEX_PASSKEY_PRIVATE_KEY_PEM', ProtectedValue.fromString('-----BEGIN PRIVATE KEY-----'))
		expect(readPasskey(entry)).toEqual({ relyingParty: 'example.org', username: 'jan' })
		expect(isPasskeyField('KPEX_PASSKEY_USER_HANDLE')).toBe(true)
	})
})

describe('editing', () => {
	it('keeps the previous state in history', async () => {
		const db = await openRichFixture()
		const entry = entryByTitle(db, 'GitHub')
		const historyBefore = entry.history.length
		const draft = { ...draftFromEntry(entry), password: 'gh-secret-3' }

		expect(applyDraft(db, entry, draft)).toBe(true)
		expect(getField(entry, 'Password')).toBe('gh-secret-3')
		expect(entry.fields.get('Password')).toBeInstanceOf(ProtectedValue)
		expect(entry.history).toHaveLength(historyBefore + 1)
		expect(getField(entry.history.at(-1)!, 'Password')).toBe('gh-secret-2')
	})

	it('does not touch history for unchanged drafts', async () => {
		const db = await openRichFixture()
		const entry = entryByTitle(db, 'GitHub')
		const historyBefore = entry.history.length
		expect(applyDraft(db, entry, draftFromEntry(entry))).toBe(false)
		expect(entry.history).toHaveLength(historyBefore)
	})

	it('trims history to the database limit', async () => {
		const db = await openRichFixture()
		db.meta.historyMaxItems = 2
		const entry = entryByTitle(db, 'Hausbank')
		for (let i = 0; i < 5; i++) {
			applyDraft(db, entry, { ...draftFromEntry(entry), password: `pin-${i}` })
		}
		expect(entry.history).toHaveLength(2)
		expect(getField(entry.history.at(-1)!, 'Password')).toBe('pin-3')
	})

	it('adds, renames and removes custom fields and attachments', async () => {
		const db = await openRichFixture()
		const entry = entryByTitle(db, 'GitHub')
		const draft = draftFromEntry(entry)
		draft.customFields = [{ key: 'PIN', value: '0000', protected: true }]
		draft.attachments = []
		await attachFile(db, draft, 'key.pem', new TextEncoder().encode('-----BEGIN-----'))
		applyDraft(db, entry, draft)

		expect([...entry.fields.keys()].sort()).toEqual(['Notes', 'PIN', 'Password', 'Title', 'URL', 'UserName'])
		expect([...entry.binaries.keys()]).toEqual(['key.pem'])
		// The old state, including the removed attachment, stays restorable.
		expect(entry.history.at(-1)!.binaries.has('notes.txt')).toBe(true)
	})

	it('rejects custom fields that shadow standard ones', async () => {
		const db = newDatabase()
		const entry = createEntry(db, db.getDefaultGroup(), emptyDraft())
		const draft = { ...draftFromEntry(entry), customFields: [{ key: 'Password', value: 'x', protected: false }] }
		expect(() => applyDraft(db, entry, draft)).toThrow('Invalid custom field')
	})

	it('restores a history state, keeping the current one in history', async () => {
		const db = await openRichFixture()
		const entry = entryByTitle(db, 'GitHub')
		restoreHistory(db, entry, 0)
		expect(getField(entry, 'Password')).toBe('gh-secret-1')
		expect(getField(entry.history.at(-1)!, 'Password')).toBe('gh-secret-2')
	})
})

describe('fieldNameProblems', () => {
	it('checks names trimmed, as they are saved', () => {
		const problems = fieldNameProblems([
			{ key: 'PIN' },
			{ key: ' PIN ' },
			{ key: 'Title ' },
			{ key: '  ' },
			{ key: 'Other' },
		])
		expect([...problems]).toEqual([[1, 'duplicate'], [2, 'reserved'], [3, 'empty']])
	})
})

describe('deleting', () => {
	it('recycles first, then deletes permanently', async () => {
		const db = await openRichFixture()
		const entry = entryByTitle(db, 'Hausbank')
		expect(deleteEntry(db, entry)).toBe('recycled')
		expect(isInRecycleBin(db, entry)).toBe(true)
		expect(deleteEntry(db, entry)).toBe('deleted')
		expect(entry.parentGroup).toBeUndefined()
		expect(db.deletedObjects.some((object) => object.uuid?.equals(entry.uuid))).toBe(true)
	})

	it('handles groups the same way and protects root and bin', async () => {
		const db = newDatabase()
		const root = db.getDefaultGroup()
		const group = createGroup(db, root, 'Temp')
		expect(deleteGroup(db, group)).toBe('recycled')
		emptyRecycleBin(db)
		expect(recycleBin(db)!.groups).toHaveLength(0)
		expect(() => deleteGroup(db, root)).toThrow()
		expect(() => deleteGroup(db, recycleBin(db)!)).toThrow()
	})

	it('moves a recycle bin inside a deleted group to the top first', async () => {
		const db = newDatabase()
		const root = db.getDefaultGroup()
		const holder = createGroup(db, root, 'Holder')
		const bin = createGroup(db, holder, 'Bin')
		db.meta.recycleBinUuid = bin.uuid
		db.createEntry(holder)
		db.createEntry(bin)
		expect(deleteGroup(db, holder)).toBe('recycled')
		expect(bin.parentGroup).toBe(root)
		expect(holder.parentGroup).toBe(bin)

		const loaded = await openDatabase(await db.save(), createCredentials({ password: 'test' }))
		expect([...loaded.getDefaultGroup().allEntries()]).toHaveLength(2)
		expect(recycleBin(loaded)!.groups.map((group) => group.name)).toEqual(['Holder'])
	})

	it('treats a missing recycle bin setting as on and creates the bin when needed', () => {
		const db = newDatabase()
		const entry = db.createEntry(db.getDefaultGroup())
		const group = createGroup(db, db.getDefaultGroup(), 'Temp')
		const bin = recycleBin(db)!
		db.move(bin, null)
		// as read from a file that has neither the setting nor a bin
		Object.assign(db.meta, { _recycleBinEnabled: undefined, _recycleBinUuid: undefined })
		expect(deleteEntry(db, entry)).toBe('recycled')
		expect(deleteGroup(db, group)).toBe('recycled')
		expect(isInRecycleBin(db, entry)).toBe(true)
		expect(isInRecycleBin(db, group)).toBe(true)
	})

	it('refuses to move a group into its own subtree', () => {
		const db = newDatabase()
		const parent = createGroup(db, db.getDefaultGroup(), 'Parent')
		const child = createGroup(db, parent, 'Child')
		expect(() => moveGroup(db, parent, child)).toThrow()
	})
})

describe('icons', () => {
	it('round-trips standard and custom icons through drafts', async () => {
		const db = await openRichFixture()
		const github = entryByTitle(db, 'GitHub')
		const custom = draftFromEntry(github).customIcon
		expect(custom).not.toBeNull()

		const bank = entryByTitle(db, 'Hausbank')
		applyDraft(db, bank, { ...draftFromEntry(bank), icon: 61, customIcon: null })
		expect(bank.icon).toBe(61)
		applyDraft(db, bank, { ...draftFromEntry(bank), customIcon: custom })
		expect(bank.customIcon?.id).toBe(custom)
		expect(bank.history.at(-1)!.icon).toBe(61)
	})
})

describe('drafts across database instances', () => {
	it('keeps attachments taken from an instance that was replaced by a sync', async () => {
		const before = await openRichFixture()
		const draft = draftFromEntry(entryByTitle(before, 'GitHub'))
		await attachFile(before, draft, 'new.txt', new TextEncoder().encode('only in the old instance'))

		const after = await openRichFixture()
		applyDraft(after, entryByTitle(after, 'GitHub'), draft)
		const reopened = await openDatabase(await saveDatabase(after), createCredentials({ password: 'test' }))

		const attachment = draftFromEntry(entryByTitle(reopened, 'GitHub')).attachments.find((candidate) => candidate.name === 'new.txt')!
		expect(new TextDecoder().decode(attachmentData(attachment))).toBe('only in the old instance')
	})
})

describe('changedFields', () => {
	it('lists what differs between two states, standard fields and attributes apart', () => {
		const db = newDatabase()
		const entry = createEntry(db, db.getDefaultGroup(), { ...emptyDraft(), title: 'Site', password: 'one', customFields: [{ key: 'PIN', value: '1', protected: true }] })
		const before = draftFromEntry(entry)

		applyDraft(db, entry, { ...before, password: 'two', url: 'https://site.example', customFields: [{ key: 'PIN', value: '1', protected: true }, { key: 'Pet', value: 'cat', protected: false }] })
		const after = draftFromEntry(entry)

		expect(changedFields(before, after)).toEqual({ standard: ['password', 'url'], custom: ['Pet'] })
		expect(changedFields(after, after)).toEqual({ standard: [], custom: [] })
	})
})
