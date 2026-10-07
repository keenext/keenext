import type { Kdbx } from 'kdbxweb'

import { BinaryStream } from 'kdbxweb'
import { describe, expect, it } from 'vitest'
import { FAST_KDF, newDatabase } from '../helpers/databases.ts'
import {
	CostlyKdfError,
	createCredentials,
	DEFAULT_KDF_LIMITS,
	kdfLimitsAllowing,
	openDatabase,
	readKdf,
	saveDatabase,
	setKdf,
} from '@/core/database'

const credentials = () => createCredentials({ password: 'test' })

/** Just the outer header: enough for the KDF check, which must not derive anything. */
function headerOnly(db: Kdbx): ArrayBuffer {
	const stm = new BinaryStream()
	db.header.generateSalts()
	db.header.write(stm)
	return stm.getWrittenBytes()
}

async function kdbx3File(rounds: number): Promise<ArrayBuffer> {
	const db = newDatabase()
	db.setVersion(3)
	db.header.keyEncryptionRounds = rounds
	return saveDatabase(db)
}

describe('key derivation limits', () => {
	it('reads the key derivation from the header', async () => {
		expect(readKdf(await saveDatabase(newDatabase()))).toEqual(FAST_KDF)
		expect(readKdf(await kdbx3File(1000))).toEqual({ type: 'aes', rounds: 1000 })
		expect(readKdf(new Uint8Array([1, 2, 3]))).toBeUndefined()
	})

	it('refuses Argon2 settings beyond the limits before deriving anything', async () => {
		const db = newDatabase()
		setKdf(db, { type: 'argon2id', memory: 64 * 1024 ** 3, iterations: 2, parallelism: 1 })
		const error = await openDatabase(headerOnly(db), credentials()).catch((cause: unknown) => cause)
		expect(error).toBeInstanceOf(CostlyKdfError)
		expect((error as CostlyKdfError).kdf).toEqual({ type: 'argon2id', memory: 64 * 1024 ** 3, iterations: 2, parallelism: 1 })
	})

	it('opens once the limits allow the file\'s AES-KDF rounds', async () => {
		const file = await kdbx3File(2000)
		const limits = { ...DEFAULT_KDF_LIMITS, aesRounds: 1000 }
		const error = await openDatabase(file, credentials(), { kdfLimits: limits }).catch((cause: unknown) => cause)
		expect(error).toBeInstanceOf(CostlyKdfError)

		const db = await openDatabase(file, credentials(), { kdfLimits: kdfLimitsAllowing((error as CostlyKdfError).kdf, limits) })
		expect(db.versionMajor).toBe(3)
	})

	it('rejects with the abort reason when the signal is aborted', async () => {
		const controller = new AbortController()
		controller.abort()
		await expect(openDatabase(await kdbx3File(1000), credentials(), { signal: controller.signal }))
			.rejects.toMatchObject({ name: 'AbortError' })
	})
})
