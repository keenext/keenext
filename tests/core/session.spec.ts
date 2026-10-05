import type { Kdbx } from 'kdbxweb'
import type { DatabaseStorage, StoredFile } from '@/core/session'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { entryByTitle, newDatabase } from '../helpers/databases.ts'
import { createCredentials, openDatabase, prepareCredentials, saveDatabase, setCredentials } from '@/core/database'
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
