// Writes an empty Argon2id/ChaCha20 database. generate.sh then lets KeePassXC merge
// the rich fixture into it, so the final file is written by KeePassXC with a KDF
// keepassxc-cli cannot select itself.
import { writeFileSync } from 'node:fs'
import { argon2id } from 'hash-wasm'
import kdbxweb from 'kdbxweb'

const [,, output] = process.argv

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

const db = kdbxweb.Kdbx.create(new kdbxweb.KdbxCredentials(kdbxweb.ProtectedValue.fromString('test')), 'Argon2 fixture')
db.setKdf(kdbxweb.Consts.KdfId.Argon2id)
db.header.kdfParameters.set('M', kdbxweb.VarDictionary.ValueType.UInt64, kdbxweb.Int64.from(8 * 1024 * 1024))
db.header.kdfParameters.set('I', kdbxweb.VarDictionary.ValueType.UInt64, kdbxweb.Int64.from(2))
db.header.dataCipherUuid = new kdbxweb.KdbxUuid(kdbxweb.Consts.CipherId.ChaCha20)
writeFileSync(output, new Uint8Array(await db.save()))
