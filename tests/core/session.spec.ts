import type { Kdbx } from 'kdbxweb'
import type { DatabaseStorage, StoredFile } from '@/core/session'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { entryByTitle, FAST_KDF, newDatabase } from '../helpers/databases.ts'
import { applyDatabaseSettings, CostlyKdfError, createCredentials, DEFAULT_KDF_LIMITS, getDatabaseSettings, openDatabase, prepareCredentials, saveDatabase, setCredentials } from '@/core/database'
import { applyDraft, createEntry, draftFromEntry, emptyDraft, getField } from '@/core/entries'
import { ConflictError, DatabaseSession } from '@/core/session'

/** In-memory stand-in for a WebDAV file with ETag checks. */
class MemoryStorage implements DatabaseStorage {
	writes = 0
	private version = 0
	constructor(private data: ArrayBuffer) {}

	async read(): Promise<StoredFile> {
		return { data: this.data.slice(0), etag: `v${this.version}` }
	}

	async write(data: ArrayBuffer, etag: string): Promise<{ etag: string }> {
		if (etag !== `v${this.version}`) {
			throw new ConflictError()
		}
		this.data = data.slice(0)
		this.version++
		this.writes++
		return { etag: `v${this.version}` }
	}

	/** Simulates another client (e.g. KeePassXC via the sync client) editing the file. */
	async editElsewhere(edit: (db: Kdbx) => void): Promise<void> {
		const db = await openDatabase(this.data, createCredentials({ password: 'test' }))
		edit(db)
		this.data = await saveDatabase(db)
		this.version++
	}
}

async function setup() {
	const db = newDatabase()
	createEntry(db, db.getDefaultGroup(), { ...emptyDraft(), title: 'Shared', password: 'one' })
	const storage = new MemoryStorage(await saveDatabase(db))
	const session = await DatabaseSession.open(storage, createCredentials({ password: 'test' }))
	return { storage, session }
}

describe('DatabaseSession', () => {
	it('tracks dirty state across saves', async () => {
		const { storage, session } = await setup()
		expect(session.dirty).toBe(false)
		createEntry(session.db, session.db.getDefaultGroup(), { ...emptyDraft(), title: 'Local' })
		session.markChanged()
		expect(session.dirty).toBe(true)
		expect(await session.save()).toEqual({ pulled: false, pushed: true })
		expect(session.dirty).toBe(false)
		expect(storage.writes).toBe(1)
	})

	it('merges remote changes on conflict instead of overwriting them', async () => {
		const { storage, session } = await setup()
		await storage.editElsewhere((db) => {
			createEntry(db, db.getDefaultGroup(), { ...emptyDraft(), title: 'Remote' })
		})
		createEntry(session.db, session.db.getDefaultGroup(), { ...emptyDraft(), title: 'Local' })
		session.markChanged()

		expect(await session.save()).toEqual({ pulled: true, pushed: true })

		const stored = await openDatabase((await storage.read()).data, createCredentials({ password: 'test' }))
		const titles = [...stored.getDefaultGroup().allEntries()].map((entry) => getField(entry, 'Title')).sort()
		expect(titles).toEqual(['Local', 'Remote', 'Shared'])
	})

	it('keeps custom data of entries added elsewhere when merging', async () => {
		const { storage, session } = await setup()
		await storage.editElsewhere((db) => {
			const entry = createEntry(db, db.getDefaultGroup(), { ...emptyDraft(), title: 'Remote' })
			// Where KeePassXC keeps an entry's browser integration settings
			entry.customData = new Map([['KeePassXC-Browser Settings', { value: '{"Allow":["example.org"]}' }]])
		})
		createEntry(session.db, session.db.getDefaultGroup(), { ...emptyDraft(), title: 'Local' })
		session.markChanged()
		expect(await session.save()).toEqual({ pulled: true, pushed: true })

		const stored = await openDatabase((await storage.read()).data, createCredentials({ password: 'test' }))
		expect(entryByTitle(stored, 'Remote').customData?.get('KeePassXC-Browser Settings')?.value)
			.toBe('{"Allow":["example.org"]}')
	})

	describe('key derivation of remote versions', () => {
		const limits = { ...DEFAULT_KDF_LIMITS, aesRounds: 5000 }

		async function setupKdbx3() {
			const db = newDatabase()
			db.setVersion(3)
			db.header.keyEncryptionRounds = 1000
			const storage = new MemoryStorage(await saveDatabase(db))
			const session = await DatabaseSession.open(storage, createCredentials({ password: 'test' }), { kdfLimits: limits })
			return { storage, session }
		}

		it('refuses a remote version that asks for more than was accepted', async () => {
			const { storage, session } = await setupKdbx3()
			await storage.editElsewhere((db) => {
				db.header.keyEncryptionRounds = 10_000
			})
			createEntry(session.db, session.db.getDefaultGroup(), { ...emptyDraft(), title: 'Local' })
			session.markChanged()
			await expect(session.save()).rejects.toBeInstanceOf(CostlyKdfError)
		})

		it('accepts a remote version with the key derivation the local database uses', async () => {
			const { storage, session } = await setupKdbx3()
			session.db.header.keyEncryptionRounds = 10_000
			session.markChanged()
			await session.save()
			await storage.editElsewhere((db) => {
				createEntry(db, db.getDefaultGroup(), { ...emptyDraft(), title: 'Remote' })
			})
			createEntry(session.db, session.db.getDefaultGroup(), { ...emptyDraft(), title: 'Local' })
			session.markChanged()
			expect(await session.save()).toEqual({ pulled: true, pushed: true })
		})
	})

	describe('encryption settings when merging', () => {
		const stronger = { ...FAST_KDF, iterations: 2 }

		async function storedSettings(storage: MemoryStorage) {
			return getDatabaseSettings(await openDatabase((await storage.read()).data, createCredentials({ password: 'test' })))
		}

		it('keeps settings changed elsewhere', async () => {
			const { storage, session } = await setup()
			await storage.editElsewhere((db) => {
				applyDatabaseSettings(db, { ...getDatabaseSettings(db), cipher: 'twofish', kdf: stronger })
			})
			createEntry(session.db, session.db.getDefaultGroup(), { ...emptyDraft(), title: 'Local' })
			session.markChanged()
			expect(await session.save()).toEqual({ pulled: true, pushed: true })

			const settings = await storedSettings(storage)
			expect(settings.cipher).toBe('twofish')
			expect(settings.kdf).toEqual(stronger)
			expect(getDatabaseSettings(session.db).kdf).toEqual(stronger)
		})

		it('keeps settings changed here', async () => {
			const { storage, session } = await setup()
			applyDatabaseSettings(session.db, { ...getDatabaseSettings(session.db), kdf: stronger })
			session.markChanged()
			await storage.editElsewhere((db) => {
				createEntry(db, db.getDefaultGroup(), { ...emptyDraft(), title: 'Remote' })
			})
			expect(await session.save()).toEqual({ pulled: true, pushed: true })
			expect((await storedSettings(storage)).kdf).toEqual(stronger)
		})

		it('takes the later change when both sides changed them', async () => {
			vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-01-01T10:00:00Z') })
			const { storage, session } = await setup()
			applyDatabaseSettings(session.db, { ...getDatabaseSettings(session.db), cipher: 'aes' })
			session.markChanged()
			vi.setSystemTime(new Date('2026-01-01T10:00:10Z'))
			await storage.editElsewhere((db) => {
				applyDatabaseSettings(db, { ...getDatabaseSettings(db), kdf: stronger })
			})
			await session.save()

			const settings = await storedSettings(storage)
			expect(settings.kdf).toEqual(stronger)
			expect(settings.cipher).toBe('chacha20')
		})

		async function setupKdbx3() {
			const db = newDatabase()
			db.setVersion(3)
			db.header.keyEncryptionRounds = 1000
			const storage = new MemoryStorage(await saveDatabase(db))
			const session = await DatabaseSession.open(storage, createCredentials({ password: 'test' }))
			createEntry(session.db, session.db.getDefaultGroup(), { ...emptyDraft(), title: 'Local' })
			session.markChanged()
			return { storage, session }
		}

		it('keeps raised AES-KDF rounds of a KDBX 3.1 file', async () => {
			const { storage, session } = await setupKdbx3()
			await storage.editElsewhere((db) => {
				db.header.keyEncryptionRounds = 2000
			})
			await session.save()
			expect((await storedSettings(storage)).kdf).toEqual({ type: 'aes', rounds: 2000 })
		})

		it('keeps an upgrade to KDBX 4 made elsewhere', async () => {
			const { storage, session } = await setupKdbx3()
			await storage.editElsewhere((db) => {
				applyDatabaseSettings(db, { ...getDatabaseSettings(db), kdf: FAST_KDF })
			})
			await session.save()

			const stored = await openDatabase((await storage.read()).data, createCredentials({ password: 'test' }))
			expect(stored.versionMajor).toBe(4)
			expect(getDatabaseSettings(stored).kdf).toEqual(FAST_KDF)
			expect(() => entryByTitle(stored, 'Local')).not.toThrow()
		})
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it('keeps the newer edit of the same entry and history of the other', async () => {
		// KDBX timestamps have second resolution; edits must be seconds apart to be distinguishable.
		vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-01-01T10:00:00Z') })
		const { storage, session } = await setup()
		vi.setSystemTime(new Date('2026-01-01T10:00:10Z'))
		await storage.editElsewhere((db) => {
			const entry = entryByTitle(db, 'Shared')
			applyDraft(db, entry, { ...draftFromEntry(entry), password: 'remote' })
		})
		vi.setSystemTime(new Date('2026-01-01T10:00:20Z'))
		const entry = entryByTitle(session.db, 'Shared')
		applyDraft(session.db, entry, { ...draftFromEntry(entry), password: 'local' })
		session.markChanged()
		await session.save()

		const stored = await openDatabase((await storage.read()).data, createCredentials({ password: 'test' }))
		const merged = entryByTitle(stored, 'Shared')
		expect(getField(merged, 'Password')).toBe('local')
		expect(merged.history.map((state) => getField(state, 'Password'))).toEqual(expect.arrayContaining(['one', 'remote']))
	})

	it('picks up remote changes on sync without writing', async () => {
		const { storage, session } = await setup()
		await storage.editElsewhere((db) => {
			createEntry(db, db.getDefaultGroup(), { ...emptyDraft(), title: 'Remote' })
		})
		const before = session.revision
		expect(await session.sync()).toEqual({ pulled: true, pushed: false })
		expect(session.revision).toBeGreaterThan(before)
		expect(session.dirty).toBe(false)
		expect(storage.writes).toBe(0)
		expect(() => entryByTitle(session.db, 'Remote')).not.toThrow()
	})

	it('does nothing on sync when nothing changed', async () => {
		const { storage, session } = await setup()
		expect(await session.sync()).toEqual({ pulled: false, pushed: false })
		expect(storage.writes).toBe(0)
	})

	it('serialises concurrent saves and skips those with nothing left to write', async () => {
		const { storage, session } = await setup()
		createEntry(session.db, session.db.getDefaultGroup(), emptyDraft())
		session.markChanged()
		const results = await Promise.all([session.save(), session.save(), session.save()])
		expect(results.map((result) => result.pushed)).toEqual([true, false, false])
		expect(storage.writes).toBe(1)
		expect(session.dirty).toBe(false)
	})

	it('surfaces non-conflict storage errors', async () => {
		const { storage, session } = await setup()
		storage.write = async () => {
			throw new Error('disk full')
		}
		session.markChanged()
		await expect(session.save()).rejects.toThrow('disk full')
		expect(session.dirty).toBe(true)
	})
})

describe('master key change', () => {
	it('saves with the new key and still merges a remote change made with the old one', async () => {
		const { storage, session } = await setup()
		setCredentials(session.db, await prepareCredentials({ password: 'new' }))
		session.markChanged()
		await storage.editElsewhere((db) => {
			createEntry(db, db.getDefaultGroup(), { ...emptyDraft(), title: 'Remote' })
		})

		expect(await session.save()).toEqual({ pulled: true, pushed: true })

		const stored = (await storage.read()).data
		await expect(openDatabase(stored, createCredentials({ password: 'test' }))).rejects.toThrow()
		const reopened = await openDatabase(stored, createCredentials({ password: 'new' }))
		expect(() => entryByTitle(reopened, 'Remote')).not.toThrow()
	})
})
