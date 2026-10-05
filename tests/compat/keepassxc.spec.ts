import { beforeAll, describe, expect, it } from 'vitest'
import { installArgon2 } from '@/core/argon2'
import { createCredentials, openDatabase, saveDatabase } from '@/core/database'
import { exportXml, fixture, fixturesDir, hasKeepassxc, keepassxc, writeTemp } from '../helpers/keepassxc'

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
