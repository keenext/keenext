import type { Kdbx, KdbxEntry } from 'kdbxweb'
import { installArgon2 } from '@/core/argon2'
import { createCredentials, createDatabase, openDatabase } from '@/core/database'
import { getField } from '@/core/entries'
import { fixture } from './keepassxc'

installArgon2()

/** KDF settings that keep tests fast; never use outside tests. */
export const FAST_KDF = { type: 'argon2id', memory: 1024 * 1024, iterations: 1, parallelism: 1 } as const

export function openRichFixture(): Promise<Kdbx> {
	return openDatabase(fixture('keepassxc-password.kdbx'), createCredentials({ password: 'test' }))
}

export function newDatabase(name = 'Test'): Kdbx {
	return createDatabase(name, createCredentials({ password: 'test' }), FAST_KDF)
}

export function entryByTitle(db: Kdbx, title: string): KdbxEntry {
	for (const entry of db.getDefaultGroup().allEntries()) {
		if (getField(entry, 'Title') === title) {
			return entry
		}
	}
	throw new Error(`No entry "${title}"`)
}
