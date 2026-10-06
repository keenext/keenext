import { describe, expect, it } from 'vitest'
import { entryByTitle, newDatabase, openRichFixture } from '../helpers/databases.ts'
import { draftFromEntry, getField } from '@/core/entries'
import { readTotp } from '@/core/totp'
import { exportCsv, exportXml, importBitwarden, importCsv, importDatabase, loadXmlDatabase, parseCsv, totpToOtpUri } from '@/core/transfer'

function titles(group: { allEntries(): IterableIterator<{ fields: Map<string, unknown> }> }): string[] {
	return [...group.allEntries()].map((entry) => getField(entry as never, 'Title')).sort()
}

describe('parseCsv', () => {
	it('handles quotes, doubled quotes, line breaks and CRLF', () => {
		expect(parseCsv('﻿a,"b ""x""","c\nd"\r\n1,2,3\n')).toEqual([['a', 'b "x"', 'c\nd'], ['1', '2', '3']])
	})

	it('skips empty lines', () => {
		expect(parseCsv('a,b\n\n1,2\n\n')).toEqual([['a', 'b'], ['1', '2']])
	})
})

describe('CSV round trip', () => {
	it('re-imports its own export with groups, TOTP and timestamps', async () => {
		const source = await openRichFixture()
		const target = newDatabase()
		const result = importCsv(target, target.getDefaultGroup(), 'Imported', exportCsv(source))

		expect(result.entries).toBe(5)
		expect(result.group.groups.map((group) => group.name).sort()).toEqual(['Banking', 'Internet'])
		const github = entryByTitle(target, 'GitHub')
		expect(github.parentGroup?.name).toBe('Internet')
		expect(draftFromEntry(github)).toMatchObject({ username: 'jan@example.org', password: 'gh-secret-2', notes: 'Zeile 1 mit Umlauten: äöüß\nZeile 2' })
		expect(readTotp(github)?.secret).toEqual(readTotp(entryByTitle(source, 'GitHub'))?.secret)
		expect(github.times.creationTime?.toISOString()).toBe('2024-01-02T10:00:00.000Z')
		expect(getField(entryByTitle(target, 'Sonderzeichen <>&"\' 🔑'), 'Password')).toBe('p<a>&s"s\'🔒')
	})

	it('maps other managers\' column names and keeps unknown columns', () => {
		const db = newDatabase()
		importCsv(db, db.getDefaultGroup(), 'Browser', 'name,url,username,password,note,PIN\nShop,https://shop.example,me,pw,hello,1234\n')
		const entry = entryByTitle(db, 'Shop')
		expect(draftFromEntry(entry)).toMatchObject({ url: 'https://shop.example', username: 'me', password: 'pw', notes: 'hello' })
		expect(getField(entry, 'PIN')).toBe('1234')
	})

	it('rejects files without title or password column', () => {
		const db = newDatabase()
		expect(() => importCsv(db, db.getDefaultGroup(), 'x', 'foo,bar\n1,2\n')).toThrow()
	})
})

describe('totpToOtpUri', () => {
	it('accepts otpauth, steam and bare secrets', () => {
		expect(totpToOtpUri('otpauth://totp/x?secret=ABC', 'x')).toBe('otpauth://totp/x?secret=ABC')
		expect(totpToOtpUri('JBSW Y3DP EHPK 3PXP', 'me')).toMatch(/^otpauth:\/\/totp\/me\?secret=JBSWY3DPEHPK3PXP/)
		expect(totpToOtpUri('steam://JBSWY3DPEHPK3PXP', 'me')).toContain('encoder=steam')
		expect(totpToOtpUri('not base32 !', 'me')).toBeUndefined()
	})
})

describe('importBitwarden', () => {
	const exported = JSON.stringify({
		encrypted: false,
		folders: [{ id: 'f1', name: 'Work/Servers' }],
		items: [
			{
				type: 1,
				name: 'Mail',
				folderId: 'f1',
				favorite: true,
				notes: 'note',
				login: { username: 'me', password: 'secret', totp: 'JBSWY3DPEHPK3PXP', uris: [{ uri: 'https://mail.example' }, { uri: 'https://webmail.example' }] },
				fields: [{ name: 'Recovery', value: 'r3c', type: 1 }, { name: 'Plain', value: 'p', type: 0 }],
			},
			{ type: 3, name: 'Visa', card: { cardholderName: 'Jan', number: '4111111111111111', code: '123', brand: 'Visa' } },
			{ type: 2, name: 'Note only', notes: 'just text' },
		],
	})

	it('maps logins, folders, URIs, TOTP and custom fields', () => {
		const db = newDatabase()
		const result = importBitwarden(db, db.getDefaultGroup(), 'Bitwarden', exported)
		expect(result.entries).toBe(3)
		const mail = entryByTitle(db, 'Mail')
		expect(mail.parentGroup?.name).toBe('Servers')
		expect(mail.parentGroup?.parentGroup?.name).toBe('Work')
		const draft = draftFromEntry(mail)
		expect(draft).toMatchObject({ username: 'me', password: 'secret', url: 'https://mail.example', notes: 'note', tags: ['favorite'] })
		expect(draft.customFields).toContainEqual({ key: 'KP2A_URL_1', value: 'https://webmail.example', protected: false })
		expect(draft.customFields).toContainEqual({ key: 'Recovery', value: 'r3c', protected: true })
		expect(readTotp(mail)?.digits).toBe(6)
	})

	it('keeps card details as attributes, secrets protected', () => {
		const db = newDatabase()
		importBitwarden(db, db.getDefaultGroup(), 'Bitwarden', exported)
		const fields = draftFromEntry(entryByTitle(db, 'Visa')).customFields
		expect(fields).toContainEqual({ key: 'card.number', value: '4111111111111111', protected: true })
		expect(fields).toContainEqual({ key: 'card.brand', value: 'Visa', protected: false })
	})

	it('refuses encrypted exports', () => {
		const db = newDatabase()
		expect(() => importBitwarden(db, db.getDefaultGroup(), 'x', '{"encrypted":true,"items":[]}')).toThrow('Encrypted')
	})
})

describe('databases and XML', () => {
	it('copies another database into a new group, without its recycle bin', async () => {
		const source = await openRichFixture()
		source.remove(entryByTitle(source, 'Hausbank'))
		const target = newDatabase()
		const result = importDatabase(target, target.getDefaultGroup(), 'Other', source)
		expect(result.merged).toBe(false)
		expect(titles(result.group)).toEqual(['Alte Karte (abgelaufen)', 'GitHub', 'GitHub API (reference)', 'Sonderzeichen <>&"\' 🔑'])
		expect(draftFromEntry(entryByTitle(target, 'GitHub')).attachments.map((attachment) => attachment.name)).toEqual(['notes.txt'])
	})

	it('merges another copy of the same database', async () => {
		const db = await openRichFixture()
		const copy = await openRichFixture()
		copy.createEntry(copy.getDefaultGroup()).fields.set('Title', 'Only in copy')
		const result = importDatabase(db, db.getDefaultGroup(), 'ignored', copy)
		expect(result.merged).toBe(true)
		expect(() => entryByTitle(db, 'Only in copy')).not.toThrow()
	})

	it('round-trips through KeePass XML', async () => {
		const source = await openRichFixture()
		const target = newDatabase()
		const result = importDatabase(target, target.getDefaultGroup(), 'From XML', await loadXmlDatabase(await exportXml(source)))
		expect(result.entries).toBe(5)
		expect(getField(entryByTitle(target, 'GitHub'), 'Recovery codes')).toBe('aaaa-bbbb\ncccc-dddd')
	})
})
