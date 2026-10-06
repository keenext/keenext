// Writes an empty database with settings keepassxc-cli cannot select itself
// (Argon2id, ChaCha20, Twofish). generate.sh then lets KeePassXC merge the rich
// fixture into it, so the final file is written by KeePassXC with those settings.
//   node make-base.mjs <output> <chacha20|twofish> [3|4]
import { writeFileSync } from 'node:fs'
import { DOMParser, XMLSerializer } from '@xmldom/xmldom'
import { argon2id } from 'hash-wasm'
import * as kdbxweb from 'kdbxweb'

const [,, output, cipher, version = '4'] = process.argv
Object.assign(globalThis, { DOMParser, XMLSerializer })

kdbxweb.CryptoEngine.setArgon2Impl(async (password, salt, memory, iterations, length, parallelism) => {
	const hash = await argon2id({
		password: new Uint8Array(password),
		salt: new Uint8Array(salt),
		memorySize: memory,
		iterations,
		hashLength: length,
		parallelism,
		outputType: 'binary',
	})
	return hash.buffer
})

const db = kdbxweb.Kdbx.create(new kdbxweb.KdbxCredentials(kdbxweb.ProtectedValue.fromString('test')), `${cipher} fixture`)
if (version === '3') {
	db.setVersion(3)
} else {
	db.setKdf(kdbxweb.Consts.KdfId.Argon2id)
	db.header.kdfParameters.set('M', kdbxweb.VarDictionary.ValueType.UInt64, kdbxweb.Int64.from(8 * 1024 * 1024))
	db.header.kdfParameters.set('I', kdbxweb.VarDictionary.ValueType.UInt64, kdbxweb.Int64.from(2))
}
db.header.dataCipherUuid = new kdbxweb.KdbxUuid(cipher === 'twofish' ? kdbxweb.Consts.CipherId.Twofish : kdbxweb.Consts.CipherId.ChaCha20)
writeFileSync(output, new Uint8Array(await db.save()))
