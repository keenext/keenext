import type { Kdbx, KdbxEntry, KdbxGroup } from 'kdbxweb'

import { describe, expect, it } from 'vitest'
import { newDatabase } from '../helpers/databases.ts'
import { createCredentials, openDatabase, saveDatabase } from '@/core/database'
import { getField } from '@/core/entries'
import { removeDuplicates } from '@/core/repair'

const at = (minutes: number) => new Date(Date.UTC(2024, 0, 1, 0, minutes))

function occurrences(db: Kdbx, item: KdbxEntry | KdbxGroup): (KdbxEntry | KdbxGroup)[] {
	return [...db.getDefaultGroup().allGroupsAndEntries()].filter((other) => other.uuid.equals(item.uuid))
}

/** Saves and loads, so the two copies become separate objects as in a file. */
async function reload(db: Kdbx): Promise<Kdbx> {
	return openDatabase(await saveDatabase(db), createCredentials({ password: 'test' }))
}

describe('removeDuplicates', () => {
	it('leaves a clean database alone', async () => {
		const db = newDatabase()
		db.createEntry(db.getDefaultGroup())
		expect(removeDuplicates(db)).toBe(0)
	})

	it('keeps an entry at the place it was moved to last, with the content changed last', async () => {
		const db = newDatabase()
		const root = db.getDefaultGroup()
		const older = db.createGroup(root, 'Older')
		const newer = db.createGroup(root, 'Newer')
		const entry = db.createEntry(older)
		entry.fields.set('Title', 'old')
		entry.times.lastModTime = at(1)
		entry.times.locationChanged = at(1)
		const loaded = await reload(db)
		const [copy] = occurrences(loaded, entry) as KdbxEntry[]
		// a second copy in the newer group with a newer location but older content
		const second = loaded.createEntry(loaded.getGroup(newer.uuid)!)
		second.copyFrom(copy!)
		second.times.locationChanged = at(5)
		copy!.fields.set('Title', 'changed')
		copy!.times.lastModTime = at(3)
		const broken = await reload(loaded)

		expect(removeDuplicates(broken)).toBe(1)

		const [kept] = occurrences(broken, entry) as KdbxEntry[]
		expect(occurrences(broken, entry)).toHaveLength(1)
		expect(kept!.parentGroup!.name).toBe('Newer')
		expect(getField(kept!, 'Title')).toBe('changed')
		expect(kept!.times.locationChanged).toEqual(at(5))
		expect(kept!.history.map((state) => getField(state, 'Title'))).toContain('old')
		const merged = await reload(broken)
		merged.merge(await reload(broken))
	})

	it('drops a second reference to the same object', () => {
		const db = newDatabase()
		const root = db.getDefaultGroup()
		const group = db.createGroup(root, 'G')
		const entry = db.createEntry(root)
		group.entries.push(entry)
		entry.parentGroup = group

		expect(removeDuplicates(db)).toBe(1)
		expect(occurrences(db, entry)).toHaveLength(1)
		expect(entry.parentGroup!.entries).toContain(entry)
	})

	it('moves the children of a dropped group copy into the one that stays', async () => {
		const db = newDatabase()
		const root = db.getDefaultGroup()
		const group = db.createGroup(root, 'G')
		group.times.locationChanged = at(1)
		const loaded = await reload(db)
		const copy = loaded.createGroup(loaded.getDefaultGroup(), 'G')
		copy.uuid = group.uuid
		copy.times.locationChanged = at(5)
		const onlyInFirst = loaded.createEntry(loaded.getGroup(group.uuid)!)

		expect(removeDuplicates(loaded)).toBe(1)

		expect(occurrences(loaded, group)).toHaveLength(1)
		expect(onlyInFirst.parentGroup).toBe(copy)
		expect(copy.entries).toContain(onlyInFirst)
	})
})
