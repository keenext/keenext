import { ProtectedValue } from 'kdbxweb'
import { describe, expect, it } from 'vitest'
import { entryByTitle, newDatabase, openRichFixture } from '../helpers/databases.ts'
import {
	applyDraft,
	attachFile,
	attachmentData,
	createEntry,
	deleteEntry,
	draftFromEntry,
	emptyDraft,
	getField,
	isExpired,
	isInRecycleBin,
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
