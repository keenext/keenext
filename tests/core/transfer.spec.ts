import { describe, expect, it } from 'vitest'
import { entryByTitle, newDatabase, openRichFixture } from '../helpers/databases.ts'
import { createCredentials, openDatabase, saveDatabase } from '@/core/database'
import { attachmentData, draftFromEntry, getField } from '@/core/entries'
import { readTotp } from '@/core/totp'
import { exportCsv, exportXml, importBitwarden, importCsv, importDatabase, importJson, loadXmlDatabase, parseCsv, readJsonExport, totpToOtpUri } from '@/core/transfer'

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

	it('renames custom fields named like a standard field', () => {
		const db = newDatabase()
		importBitwarden(db, db.getDefaultGroup(), 'x', JSON.stringify({ items: [{ type: 1, name: 'A', login: { password: 'pw' }, fields: [{ name: 'Password', value: 'old', type: 1 }] }] }))
		const entry = entryByTitle(db, 'A')
		expect(getField(entry, 'Password')).toBe('pw')
		expect(getField(entry, 'Password (2)')).toBe('old')
	})
})

async function importJsonText(text: string) {
	const db = newDatabase()
	const result = importJson(db, db.getDefaultGroup(), 'Imported', await readJsonExport(db, text))
	return { db, result }
}

describe('Nextcloud Passwords database backup', () => {
	const root = '00000000-0000-0000-0000-000000000000'
	const backup = {
		version: 3,
		encrypted: false,
		folders: [
			{ id: 'f-work', label: 'Work', parent: root, edited: 1700000000 },
			{ id: 'f-servers', label: 'Servers', parent: 'f-work', edited: 1700000000 },
		],
		tags: [{ id: 't-admin', label: 'admin', color: '#ff0000' }],
		passwords: [
			{
				label: 'Router',
				username: 'root',
				password: 'r0uter',
				notes: 'In the basement',
				url: 'https://192.168.0.1',
				folder: 'f-servers',
				edited: 1700000100,
				favorite: true,
				tags: ['t-admin'],
				customFields: [
					{ label: 'PIN', type: 'secret', value: '1234' },
					{ label: 'Support', type: 'email', value: 'help@example.org' },
					{ label: 'otp', type: 'secret', value: 'JBSWY3DPEHPK3PXP' },
				],
			},
			{ label: 'Top level', username: '', password: 'x', notes: '', url: '', folder: root, edited: 1700000200, tags: [], customFields: [] },
		],
	}

	it('maps passwords, folders, tags, custom fields and TOTP', async () => {
		const { db, result } = await importJsonText(JSON.stringify(backup))
		expect(result.entries).toBe(2)
		expect(result.groups).toBe(3)
		const router = entryByTitle(db, 'Router')
		expect(router.parentGroup?.name).toBe('Servers')
		expect(router.parentGroup?.parentGroup?.name).toBe('Work')
		const draft = draftFromEntry(router)
		expect(draft).toMatchObject({ username: 'root', password: 'r0uter', url: 'https://192.168.0.1', notes: 'In the basement', tags: ['admin', 'favorite'] })
		expect(draft.customFields).toContainEqual({ key: 'PIN', value: '1234', protected: true })
		expect(draft.customFields).toContainEqual({ key: 'Support', value: 'help@example.org', protected: false })
		expect(readTotp(router)?.digits).toBe(6)
		expect(router.times.lastModTime?.toISOString()).toBe('2023-11-14T22:15:00.000Z')
		expect(entryByTitle(db, 'Top level').parentGroup).toBe(result.group)
	})

	it('survives a folder loop', async () => {
		const looped = { ...backup, folders: [{ id: 'a', label: 'A', parent: 'b' }, { id: 'b', label: 'B', parent: 'a' }], passwords: [{ label: 'In loop', folder: 'a' }] }
		const { db } = await importJsonText(JSON.stringify(looped))
		expect(entryByTitle(db, 'In loop').parentGroup?.name).toBe('A')
	})

	it('refuses backups protected with a password', async () => {
		await expect(importJsonText(JSON.stringify({ version: 3, encrypted: true, passwords: 'x', challenge: 'y' }))).rejects.toThrow('protected with a password')
	})
})

describe('Passman JSON export', () => {
	const fileData = `data:text/plain;base64,${btoa('backup codes')}`
	const credentials = [
		{
			credential_id: 1,
			guid: 'g1',
			label: 'Mail',
			username: '',
			email: 'me@example.org',
			password: 'm4il',
			url: 'https://mail.example',
			description: 'Main account',
			tags: [{ text: 'private' }],
			created: 1700000000,
			changed: 1700000100,
			expire_time: 1800000000,
			delete_time: 0,
			otp: { secret: 'JBSWY3DPEHPK3PXP', algorithm: 'SHA256', digits: 8, period: 60 },
			custom_fields: [
				{ label: 'Recovery', value: 'r3c', secret: true, field_type: 'password' },
				{ label: 'Note', value: 'plain', secret: false, field_type: 'text' },
				{ label: 'Scan', value: { filename: 'scan.txt', file_data: `data:text/plain;base64,${btoa('scanned')}` }, field_type: 'file' },
			],
			files: [{ filename: 'codes.txt', file_data: fileData }],
		},
		{ credential_id: 2, guid: 'g2', label: 'Forum', username: 'jan', email: 'jan@example.org', password: 'f', tags: [], custom_fields: [], files: [], otp: {} },
		{ credential_id: 3, guid: 'g3', label: 'Deleted', password: 'd', delete_time: 1700000500, custom_fields: [], files: [] },
	]

	it('maps credentials, tags, custom fields, TOTP, expiry and files', async () => {
		const { db, result } = await importJsonText(JSON.stringify(credentials))
		expect(result.entries).toBe(2)
		const mail = entryByTitle(db, 'Mail')
		const draft = draftFromEntry(mail)
		expect(draft).toMatchObject({ username: 'me@example.org', password: 'm4il', url: 'https://mail.example', notes: 'Main account', tags: ['private'] })
		expect(draft.customFields).toContainEqual({ key: 'Recovery', value: 'r3c', protected: true })
		expect(draft.customFields).toContainEqual({ key: 'Note', value: 'plain', protected: false })
		expect(readTotp(mail)).toMatchObject({ algorithm: 'SHA-256', digits: 8, period: 60 })
		expect(draft.expires?.toISOString()).toBe('2027-01-15T08:00:00.000Z')
		expect(mail.times.creationTime?.toISOString()).toBe('2023-11-14T22:13:20.000Z')
		expect(draft.attachments.map((attachment) => [attachment.name, new TextDecoder().decode(attachmentData(attachment))]))
			.toEqual([['codes.txt', 'backup codes'], ['scan.txt', 'scanned']])
	})

	it('keeps the email as attribute when there is a username, and skips deleted credentials', async () => {
		const { db } = await importJsonText(JSON.stringify(credentials))
		expect(getField(entryByTitle(db, 'Forum'), 'Email')).toBe('jan@example.org')
		expect(() => entryByTitle(db, 'Deleted')).toThrow()
	})

	it('saves and reopens with the attachments', async () => {
		const { db } = await importJsonText(JSON.stringify(credentials))
		const reopened = await openDatabase(await saveDatabase(db), createCredentials({ password: 'test' }))
		expect([...entryByTitle(reopened, 'Mail').binaries.keys()]).toEqual(['codes.txt', 'scan.txt'])
	})
})

describe('readJsonExport', () => {
	it('recognises Bitwarden exports', async () => {
		const { db } = await importJsonText(JSON.stringify({ encrypted: false, items: [{ type: 1, name: 'Bw', login: { password: 'p' } }] }))
		expect(getField(entryByTitle(db, 'Bw'), 'Password')).toBe('p')
	})

	it('rejects other JSON', async () => {
		await expect(readJsonExport(newDatabase(), '{"foo":1}')).rejects.toThrow('Not a JSON export')
		await expect(readJsonExport(newDatabase(), 'not json')).rejects.toThrow('Not a JSON export')
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
