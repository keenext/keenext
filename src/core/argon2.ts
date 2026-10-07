import type { CryptoEngine } from 'kdbxweb'

import { argon2d, argon2id } from 'hash-wasm'

// No runtime import of kdbxweb here: this module is also the Argon2 worker's entire dependency tree.
const ARGON2_ID: CryptoEngine.Argon2Type = 2

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

/** Rejects with `signal.reason` once aborted; an implementation may stop the work early. */
export type Argon2Compute = (request: Argon2Request, signal?: AbortSignal) => Promise<Uint8Array>

/** Runs to the end even when aborted; it only discards the result. */
export const computeArgon2: Argon2Compute = async (request, signal) => {
	const hash = await deriveArgon2(request)
	signal?.throwIfAborted()
	return hash
}

async function deriveArgon2(request: Argon2Request): Promise<Uint8Array> {
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
	return request.type === ARGON2_ID ? argon2id(options) : argon2d(options)
}
