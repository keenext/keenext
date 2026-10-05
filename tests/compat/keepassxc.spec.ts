import { beforeAll, describe, expect, it } from 'vitest'
import { entryByTitle } from '../helpers/databases.ts'
import { exportXml, fixture, fixturesDir, hasKeepassxc, keepassxc, writeTemp } from '../helpers/keepassxc.ts'
import { installArgon2 } from '@/core/crypto'
import { createCredentials, openDatabase, saveDatabase } from '@/core/database'
import { applyDraft, attachFile, createEntry, deleteEntry, draftFromEntry, emptyDraft } from '@/core/entries'
import { createGroup } from '@/core/groups'

const password = 'test'
const keyFilePath = `${fixturesDir}keepassxc-keyfile.keyx`

const cases = [
	{ file: 'keepassxc-password.kdbx', version: '4.1', auth: { password }, input: { password } },
	{ file: 'keepassxc-password-keyfile.kdbx', version: '3.1', auth: { password, keyFile: keyFilePath }, input: { password, keyFile: fixture('keepassxc-keyfile.keyx') } },
	{ file: 'keepassxc-keyfile-only.kdbx', version: '3.1', auth: { keyFile: keyFilePath }, input: { keyFile: fixture('keepassxc-keyfile.keyx') } },
	{ file: 'keepassxc-argon2id-chacha20.kdbx', version: '4.1', auth: { password }, input: { password } },
]

beforeAll(() => installArgon2())

describe.each(cases)('$file (KDBX $version)', ({ file, version, auth, input }) => {
	it('opens', async () => {
		const db = await openDatabase(fixture(file), createCredentials(input))
		expect(`${db.versionMajor}.${db.versionMinor}`).toBe(version)
		expect([...db.getDefaultGroup().allEntries()].length).toBeGreaterThan(0)
	})

	it.runIf(hasKeepassxc)('survives an unmodified save without changes visible to KeePassXC', async () => {
		const original = writeTemp(file, fixture(file))
		const db = await openDatabase(fixture(file), createCredentials(input))
		const resaved = writeTemp(file, await saveDatabase(db))

		expect(exportXml(resaved, auth)).toBe(exportXml(original, auth))
	})
})

describe.runIf(hasKeepassxc)('edits made here, read by KeePassXC', () => {
	const auth = { password }

	it('keeps edits, history, attachments, new groups and deletions', async () => {
		const db = await openDatabase(fixture('keepassxc-password.kdbx'), createCredentials({ password }))
		const github = entryByTitle(db, 'GitHub')
		const draft = { ...draftFromEntry(github), password: 'changed-here', notes: 'Neu: ✓' }
		draft.customFields.push({ key: 'Secret answer', value: 'blue', protected: true })
		await attachFile(db, draft, 'added.txt', new TextEncoder().encode('added here'))
		applyDraft(db, github, draft)

		const group = createGroup(db, db.getDefaultGroup(), 'Neu hier')
		createEntry(db, group, { ...emptyDraft(), title: 'Created here', username: 'me', password: 'pw' })
		deleteEntry(db, entryByTitle(db, 'Hausbank'))

		const path = writeTemp('edited.kdbx', await saveDatabase(db))

		expect(keepassxc('show', path, auth, ['-s', '-a', 'Password', '-a', 'Notes', '-a', 'Secret answer', '/Internet/GitHub']))
			.toBe('changed-here\nNeu: ✓\nblue\n')
		expect(keepassxc('attachment-export', path, auth, ['--stdout', '/Internet/GitHub', 'added.txt'])).toBe('added here')
		expect(keepassxc('attachment-export', path, auth, ['--stdout', '/Internet/GitHub', 'notes.txt'])).toBe('Hello attachment ✓\n')
		expect(keepassxc('show', path, auth, ['-s', '-a', 'Password', '/Neu hier/Created here'])).toBe('pw\n')
		expect(keepassxc('ls', path, auth, ['Papierkorb'])).toContain('Hausbank')

		const xml = exportXml(path, auth)
		const githubXml = xml.slice(xml.indexOf('<Value>GitHub</Value>'))
		expect(githubXml.slice(0, githubXml.indexOf('</History>'))).toContain('gh-secret-2')
	})
})
