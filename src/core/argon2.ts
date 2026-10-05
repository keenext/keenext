import { argon2d, argon2id } from 'hash-wasm'
import { CryptoEngine } from 'kdbxweb'

export interface Argon2Request {
	password: Uint8Array
	salt: Uint8Array
	/** KiB */
	memory: number
	iterations: number
	length: number
	parallelism: number
	type: CryptoEngine.Argon2Type
	version: CryptoEngine.Argon2Version
}

export type Argon2Compute = (request: Argon2Request) => Promise<Uint8Array>

export const computeArgon2: Argon2Compute = async (request) => {
	// hash-wasm implements Argon2 v1.3 only; v1.0 predates KDBX 4 and is not written by any current client.
	if (request.version !== 0x13) {
		throw new Error(`Unsupported Argon2 version 0x${request.version.toString(16)}`)
	}
	const options = {
		password: request.password,
		salt: request.salt,
		memorySize: request.memory,
		iterations: request.iterations,
		hashLength: request.length,
		parallelism: request.parallelism,
		outputType: 'binary' as const,
	}
	return request.type === CryptoEngine.Argon2TypeArgon2id ? argon2id(options) : argon2d(options)
}

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
