import type { Kdbx, KdbxEntry, KdbxGroup } from 'kdbxweb'
import { getField, isExpired, isStandardField, StandardField } from './entries'
import { isSearchable } from './groups'
import { uuidToHex } from './placeholders'

/**
 * KeePassXC search syntax:
 *   term            matches title, username, URL, notes and tags (substring, case-insensitive)
 *   field:term      t/title, u/user/username, p/pw/password, url, n/notes, attr, attach, g/group, tag, uuid
 *   is:expired      expired entries
 *   -term / !term   exclude
 *   +term           exact (whole field) match
 *   te*m            wildcard
 *   "two words"     phrase
 * All terms must match.
 */
export interface SearchTerm {
	field: SearchField
	value: string
	exclude: boolean
	exact: boolean
}

type SearchField = 'default' | 'title' | 'username' | 'password' | 'url' | 'notes' | 'attr' | 'attach' | 'group' | 'tag' | 'uuid' | 'is'

const fieldAliases: Record<string, SearchField> = {
	t: 'title',
	title: 'title',
	u: 'username',
	user: 'username',
	username: 'username',
	p: 'password',
	pw: 'password',
	password: 'password',
	url: 'url',
	n: 'notes',
	notes: 'notes',
	attr: 'attr',
	attach: 'attach',
	g: 'group',
	group: 'group',
	tag: 'tag',
	uuid: 'uuid',
	is: 'is',
}

const tokenPattern = /([-!]?)(\+?)(?:([a-z]+):)?(?:"([^"]*)"?|(\S+))/gi

export function parseQuery(query: string): SearchTerm[] {
	const terms: SearchTerm[] = []
	for (const match of query.matchAll(tokenPattern)) {
		const [, negation, exact, prefix, quoted, bare] = match
		const field = prefix ? fieldAliases[prefix.toLowerCase()] : 'default'
		// Unknown prefix: treat "foo:bar" as a plain term, like KeePassXC.
		const value = field ? (quoted ?? bare ?? '') : `${prefix}:${quoted ?? bare ?? ''}`
		if (value === '') {
			continue
		}
		terms.push({
			field: field ?? 'default',
			value,
			exclude: negation !== '',
			exact: exact !== '',
		})
	}
	return terms
}

function compile(term: SearchTerm): (text: string) => boolean {
	const needle = term.value.toLowerCase()
	if (needle.includes('*')) {
		const source = needle.split('*').map(escapeRegExp).join('.*')
		const pattern = new RegExp(term.exact ? `^${source}$` : source, 'is')
		return (text) => pattern.test(text)
	}
	if (term.exact) {
		return (text) => text.toLowerCase() === needle
	}
	return (text) => text.toLowerCase().includes(needle)
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function candidates(entry: KdbxEntry, field: SearchField): string[] {
	switch (field) {
	case 'default':
		return [
			getField(entry, StandardField.Title),
			getField(entry, StandardField.UserName),
			getField(entry, StandardField.URL),
			getField(entry, StandardField.Notes),
			...entry.tags,
		]
	case 'title': return [getField(entry, StandardField.Title)]
	case 'username': return [getField(entry, StandardField.UserName)]
	case 'password': return [getField(entry, StandardField.Password)]
	case 'url': return [getField(entry, StandardField.URL)]
	case 'notes': return [getField(entry, StandardField.Notes)]
	case 'attr': return [...entry.fields.keys()].filter((key) => !isStandardField(key)).flatMap((key) => [key, getField(entry, key)])
	case 'attach': return [...entry.binaries.keys()]
	case 'group': return [entry.parentGroup?.name ?? '']
	case 'tag': return entry.tags
	case 'uuid': return [entry.uuid.id, uuidToHex(entry)]
	case 'is': return []
	}
}

export function matcher(terms: SearchTerm[], now = new Date()): (entry: KdbxEntry) => boolean {
	const compiled = terms.map((term) => {
		if (term.field === 'is') {
			const flag = term.value.toLowerCase()
			const test = (entry: KdbxEntry) => flag === 'expired' ? isExpired(entry, now) : false
			return { term, test }
		}
		const matches = compile(term)
		return { term, test: (entry: KdbxEntry) => candidates(entry, term.field).some(matches) }
	})
	return (entry) => compiled.every(({ term, test }) => test(entry) !== term.exclude)
}

/** Searches all searchable groups below `root` (default: the whole database). */
export function searchEntries(db: Kdbx, query: string, root: KdbxGroup = db.getDefaultGroup()): KdbxEntry[] {
	const terms = parseQuery(query)
	if (terms.length === 0) {
		return []
	}
	const matches = matcher(terms)
	const result: KdbxEntry[] = []
	for (const entry of root.allEntries()) {
		if (entry.parentGroup && isSearchable(db, entry.parentGroup) && matches(entry)) {
			result.push(entry)
		}
	}
	return result
}
