import type { KdbxEntry } from 'kdbxweb'

import { getField, StandardField } from './entries.ts'

export type SortKey = 'title' | 'username' | 'url' | 'modified' | 'created' | 'expires'

/** What the second line of an entry in the list shows. */
export type DetailLine = 'username' | 'url' | 'modified' | 'none'

export interface ListPreferences {
	sort: SortKey
	descending: boolean
	detail: DetailLine
}

export const DEFAULT_LIST_PREFERENCES: ListPreferences = { sort: 'title', descending: false, detail: 'username' }

const SORT_KEYS: readonly SortKey[] = ['title', 'username', 'url', 'modified', 'created', 'expires']
const DETAIL_LINES: readonly DetailLine[] = ['username', 'url', 'modified', 'none']

/** Stored preferences with unknown values replaced by the defaults. */
export function listPreferences(stored: unknown): ListPreferences {
	const value = (stored ?? {}) as Partial<Record<keyof ListPreferences, unknown>>
	return {
		sort: SORT_KEYS.includes(value.sort as SortKey) ? value.sort as SortKey : DEFAULT_LIST_PREFERENCES.sort,
		descending: value.descending === true,
		detail: DETAIL_LINES.includes(value.detail as DetailLine) ? value.detail as DetailLine : DEFAULT_LIST_PREFERENCES.detail,
	}
}

function sortValue(entry: KdbxEntry, key: SortKey): string | number | undefined {
	switch (key) {
		case 'title': return getField(entry, StandardField.Title)
		case 'username': return getField(entry, StandardField.UserName)
		case 'url': return getField(entry, StandardField.URL)
		case 'modified': return entry.times.lastModTime?.getTime()
		case 'created': return entry.times.creationTime?.getTime()
		case 'expires': return entry.times.expires ? entry.times.expiryTime?.getTime() : undefined
	}
}

/**
 * Sorts by `key`; entries without a value (no URL, no expiry) come last in both
 * directions, and equal values keep title order.
 */
export function sortEntries(entries: readonly KdbxEntry[], key: SortKey, descending = false): KdbxEntry[] {
	const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true })
	const keyed = entries.map((entry) => ({ entry, value: sortValue(entry, key), title: getField(entry, StandardField.Title) }))
	return keyed
		.sort((a, b) => {
			const aMissing = a.value === undefined || a.value === ''
			const bMissing = b.value === undefined || b.value === ''
			if (aMissing !== bMissing) {
				return aMissing ? 1 : -1
			}
			let order = 0
			if (!aMissing) {
				order = typeof a.value === 'number' && typeof b.value === 'number'
					? a.value - b.value
					: collator.compare(String(a.value), String(b.value))
			}
			if (descending) {
				order = -order
			}
			return order || collator.compare(a.title, b.title)
		})
		.map(({ entry }) => entry)
}
