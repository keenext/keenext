import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { entryByTitle, newDatabase } from '../helpers/databases.ts'
import { exportXml, fixture, fixturesDir, hasKeepassxc, keepassxc, writeTemp } from '../helpers/keepassxc.ts'
import { installArgon2 } from '@/core/crypto'
import { applyDatabaseSettings, createCredentials, getDatabaseSettings, openDatabase, saveDatabase } from '@/core/database'
import { applyDraft, attachFile, createEntry, deleteEntry, draftFromEntry, emptyDraft, getField } from '@/core/entries'
import { createGroup } from '@/core/groups'
import { exportCsv, exportXml as exportKeePassXml, importDatabase, loadXmlDatabase, parseCsv } from '@/core/transfer'

const password = 'test'
const keyFilePath = `${fixturesDir}keepassxc-keyfile.keyx`

const cases = [
	{ file: 'keepassxc-password.kdbx', version: '4.1', auth: { password }, input: { password } },
	{ file: 'keepassxc-password-keyfile.kdbx', version: '3.1', auth: { password, keyFile: keyFilePath }, input: { password, keyFile: fixture('keepassxc-keyfile.keyx') } },
	{ file: 'keepassxc-keyfile-only.kdbx', version: '3.1', auth: { keyFile: keyFilePath }, input: { keyFile: fixture('keepassxc-keyfile.keyx') } },
	{ file: 'keepassxc-argon2id-chacha20.kdbx', version: '4.1', auth: { password }, input: { password } },
	{ file: 'keepassxc-argon2id-twofish.kdbx', version: '4.1', auth: { password }, input: { password } },
	{ file: 'keepassxc-aeskdf-twofish.kdbx', version: '4.1', auth: { password }, input: { password } },
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

describe.runIf(hasKeepassxc)('cipher changes made here, read by KeePassXC', () => {
	it.each(['twofish', 'chacha20', 'aes'] as const)('re-encrypts with %s', async (cipher) => {
		const db = await openDatabase(fixture('keepassxc-password.kdbx'), createCredentials({ password }))
		applyDatabaseSettings(db, { ...getDatabaseSettings(db), cipher })
		const path = writeTemp(`${cipher}.kdbx`, await saveDatabase(db))

		const expected = { twofish: 'Twofish', chacha20: 'ChaCha20', aes: 'AES' }[cipher]
		expect(keepassxc('db-info', path, { password })).toContain(expected)
		expect(keepassxc('show', path, { password }, ['-s', '-a', 'Password', '/Internet/GitHub'])).toBe('gh-secret-2\n')
	})
})

describe.runIf(hasKeepassxc)('exports and imports against KeePassXC', () => {
	const auth = { password }

	it('exports CSV with the same content as KeePassXC', async () => {
		const db = await openDatabase(fixture('keepassxc-password.kdbx'), createCredentials({ password }))
		const ours = parseCsv(exportCsv(db))
		const theirs = parseCsv(keepassxc('export', writeTemp('db.kdbx', fixture('keepassxc-password.kdbx')), auth, ['-f', 'csv']))
		const byTitle = (rows: string[][]) => new Map(rows.slice(1).map((row) => [row[1], row]))
		expect(ours[0]).toEqual(theirs[0])
		expect(byTitle(ours)).toEqual(byTitle(theirs))
	})

	it('writes KeePass XML that KeePassXC imports', async () => {
		const db = await openDatabase(fixture('keepassxc-password.kdbx'), createCredentials({ password }))
		const xmlPath = writeTemp('export.xml', new TextEncoder().encode(await exportKeePassXml(db)))
		const imported = `${xmlPath}.kdbx`
		execFileSync('keepassxc-cli', ['import', '-q', '-p', xmlPath, imported], { input: 'test\ntest\n' })
		expect(keepassxc('show', imported, auth, ['-s', '-a', 'Password', '-a', 'Recovery codes', '/Internet/GitHub'])).toBe('gh-secret-2\naaaa-bbbb\ncccc-dddd\n')
	})

	it('imports KeePassXC\'s XML export', async () => {
		const xml = keepassxc('export', writeTemp('db.kdbx', fixture('keepassxc-password.kdbx')), auth, ['-f', 'xml'])
		const target = newDatabase()
		const result = importDatabase(target, target.getDefaultGroup(), 'From KeePassXC', await loadXmlDatabase(xml))
		expect(result.entries).toBe(5)
		expect(getField(entryByTitle(target, 'GitHub'), 'Password')).toBe('gh-secret-2')
	})
})

describe.runIf(hasKeepassxc)('KDBX 4.1 values written here, read by KeePassXC', () => {
	it('saves group tags and a disabled quality check as KDBX 4.1', async () => {
		const db = newDatabase()
		expect(`${db.versionMajor}.${db.versionMinor}`).toBe('4.0')
		const group = createGroup(db, db.getDefaultGroup(), 'Tagged')
		group.tags = ['work', 'shared']
		createEntry(db, group, { ...emptyDraft(), title: 'Excluded', password: 'pw' }).qualityCheck = false
		const data = await saveDatabase(db)

		// Header: signature (8 bytes), then minor and major version
		expect(new DataView(data).getUint16(8, true)).toBe(1)
		const xml = exportXml(writeTemp('kdbx41.kdbx', data), { password })
		expect(xml).toContain('<Name>Tagged</Name><Notes/><Tags>work, shared</Tags>')
		expect(xml).toContain('<QualityCheck>False</QualityCheck>')
	})
})

describe.runIf(hasKeepassxc)('key files that KeePassXC hashes as a whole', () => {
	it.each([
		['an SVG image', '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>'],
		['a KeyFile document without key data', '<?xml version="1.0"?><KeyFile><Meta><Version>1.00</Version></Meta></KeyFile>'],
	])('opens a database KeePassXC created with %s', async (_, content) => {
		const keyFile = new TextEncoder().encode(content)
		const keyFilePath = writeTemp('key.file', keyFile)
		const path = `${keyFilePath}.kdbx`
		execFileSync('keepassxc-cli', ['db-create', '-q', '-p', '--set-key-file', keyFilePath, path], { input: 'test\ntest\n' })

		const db = await openDatabase(readFileSync(path), createCredentials({ password, keyFile }))
		expect(db.getDefaultGroup()).toBeTruthy()
	})
})
