import { CryptoEngine } from 'kdbxweb'
import { type Argon2Compute, computeArgon2 } from './argon2'

/**
 * Routes kdbxweb's Argon2 calls to `compute`. The browser passes a worker-backed
 * implementation so key derivation does not freeze the UI.
 */
export function installArgon2(compute: Argon2Compute = computeArgon2): void {
	CryptoEngine.setArgon2Impl(async (password, salt, memory, iterations, length, parallelism, type, version) => {
		const hash = await compute({
			password: new Uint8Array(password),
			salt: new Uint8Array(salt),
			memory,
			iterations,
			length,
			parallelism,
			type,
			version,
		})
		return hash.buffer.slice(hash.byteOffset, hash.byteOffset + hash.byteLength) as ArrayBuffer
	})
}
