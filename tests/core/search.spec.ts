import { describe, expect, it } from 'vitest'
import { getField } from '@/core/entries'
import { parseQuery, searchEntries } from '@/core/search'
import { resolvedField, resolvePlaceholders } from '@/core/placeholders'
import { entryByTitle, openRichFixture } from '../helpers/databases'

const titles = async (query: string) => {
	const db = await openRichFixture()
	return searchEntries(db, query).map((entry) => getField(entry, 'Title')).sort()
}

describe('parseQuery', () => {
	it('understands modifiers, fields and quotes', () => {
		expect(parseQuery('-user:"jan doe" +url:x tag:work foo:bar')).toEqual([
			{ field: 'username', value: 'jan doe', exclude: true, exact: false },
			{ field: 'url', value: 'x', exclude: false, exact: true },
			{ field: 'tag', value: 'work', exclude: false, exact: false },
			{ field: 'default', value: 'foo:bar', exclude: false, exact: false },
		])
	})
})

describe('searchEntries', () => {
	it('matches default fields case-insensitively', async () => {
		expect(await titles('github')).toEqual(['GitHub', 'GitHub API (reference)'])
	})

	it('combines terms with AND and supports exclusion', async () => {
		expect(await titles('github -api')).toEqual(['GitHub'])
	})

	it('searches specific fields', async () => {
		expect(await titles('u:12345678')).toEqual(['Hausbank'])
		expect(await titles('tag:work')).toEqual(['GitHub'])
		expect(await titles('attr:IBAN')).toEqual(['Hausbank'])
		expect(await titles('attach:notes')).toEqual(['GitHub'])
		expect(await titles('g:banking')).toEqual(['Alte Karte (abgelaufen)', 'Hausbank'])
		expect(await titles('pw:1234')).toEqual(['Hausbank'])
	})

	it('supports exact and wildcard matches', async () => {
		expect(await titles('+t:github')).toEqual(['GitHub'])
		expect(await titles('t:g*api*')).toEqual(['GitHub API (reference)'])
	})

	it('finds expired entries', async () => {
		expect(await titles('is:expired')).toEqual(['Alte Karte (abgelaufen)'])
	})

	it('skips the recycle bin', async () => {
		const db = await openRichFixture()
		const entry = entryByTitle(db, 'Hausbank')
		db.remove(entry)
		expect(searchEntries(db, 'hausbank')).toEqual([])
	})
})

describe('placeholders', () => {
	it('resolves field references by UUID', async () => {
		const db = await openRichFixture()
		const reference = entryByTitle(db, 'GitHub API (reference)')
		expect(resolvedField(db, reference, 'UserName')).toBe('jan@example.org')
		expect(resolvedField(db, reference, 'Password')).toBe('gh-secret-2')
	})

	it('resolves same-entry placeholders and leaves unknown ones', async () => {
		const db = await openRichFixture()
		const entry = entryByTitle(db, 'Hausbank')
		expect(resolvePlaceholders(db, entry, '{USERNAME}/{S:IBAN}/{UNKNOWN}')).toBe('12345678/DE00 1234 5678 9000 0000 00/{UNKNOWN}')
	})

	it('stops on reference cycles', async () => {
		const db = await openRichFixture()
		const entry = entryByTitle(db, 'Hausbank')
		entry.fields.set('Notes', '{NOTES}')
		expect(resolvedField(db, entry, 'Notes')).toBe('{NOTES}')
	})
})
