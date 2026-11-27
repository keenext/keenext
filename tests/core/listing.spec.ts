import { describe, expect, it } from 'vitest'
import { newDatabase } from '../helpers/databases.ts'
import { getField } from '@/core/entries'
import { DEFAULT_LIST_PREFERENCES, listPreferences, sortEntries } from '@/core/listing'

function entries() {
	const db = newDatabase()
	const make = (title: string, url: string, modified: number, expires?: number) => {
		const entry = db.createEntry(db.getDefaultGroup())
		entry.fields.set('Title', title)
		entry.fields.set('URL', url)
		entry.times.lastModTime = new Date(modified)
		if (expires !== undefined) {
			entry.times.expires = true
			entry.times.expiryTime = new Date(expires)
		}
		return entry
	}
	return [make('beta', 'https://b', 3, 20), make('Alpha 10', '', 1), make('alpha 9', 'https://a', 2, 10)]
}

const titles = (list: ReturnType<typeof entries>) => list.map((entry) => getField(entry, 'Title'))

describe('sortEntries', () => {
	it('sorts titles case-insensitively and with numbers in order', () => {
		expect(titles(sortEntries(entries(), 'title'))).toEqual(['alpha 9', 'Alpha 10', 'beta'])
		expect(titles(sortEntries(entries(), 'title', true))).toEqual(['beta', 'Alpha 10', 'alpha 9'])
	})

	it('sorts dates and keeps entries without a value last in both directions', () => {
		expect(titles(sortEntries(entries(), 'modified', true))).toEqual(['beta', 'alpha 9', 'Alpha 10'])
		expect(titles(sortEntries(entries(), 'expires'))).toEqual(['alpha 9', 'beta', 'Alpha 10'])
		expect(titles(sortEntries(entries(), 'expires', true))).toEqual(['beta', 'alpha 9', 'Alpha 10'])
		expect(titles(sortEntries(entries(), 'url', true))).toEqual(['beta', 'alpha 9', 'Alpha 10'])
	})
})

describe('listPreferences', () => {
	it('falls back to the defaults for missing or unknown values', () => {
		expect(listPreferences(null)).toEqual(DEFAULT_LIST_PREFERENCES)
		expect(listPreferences({ sort: 'modified', descending: true, detail: 'bogus' })).toEqual({ sort: 'modified', descending: true, detail: 'username' })
	})
})
