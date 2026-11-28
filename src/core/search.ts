import type { Kdbx, KdbxEntry, KdbxGroup } from 'kdbxweb'

import { getField, isExpired, isPasskeyField, isStandardField, StandardField } from './entries.ts'
import { isSearchable } from './groups.ts'
import { uuidToHex } from './placeholders.ts'
import { EXPIRING_DAYS, weakness } from './reports.ts'
import { readTotp } from './totp.ts'

/**
 * KeePassXC search syntax:
 *   term            matches title, username, URL, notes and tags (substring, case-insensitive)
 *   field:term      t/title, u/user/username, p/pw/password, url, n/notes, attr, attach, g/group, tag, uuid
 *   _Name:term      the additional attribute "Name" (case-insensitive); _"Two words":term
 *   is:expired      also is:expiring, is:weak
 *   has:totp        also has:attachment, has:tag, has:url, has:notes, has:passkey
 *   -term / !term   exclude
 *   +term           exact (whole field) match
 *   leading *       regular expression, "*t:^git" (an invalid one matches nothing)
 *   te*m            wildcard
 *   "two words"     phrase
 * All terms must match.
 */
export interface SearchTerm {
	field: SearchField
	value: string
	exclude: boolean
	exact: boolean
	regex: boolean
	/** Name of the additional attribute, for field "custom" */
	attribute?: string
}

type SearchField = 'default' | 'title' | 'username' | 'password' | 'url' | 'notes' | 'attr' | 'attach' | 'group' | 'tag' | 'uuid' | 'is' | 'has' | 'custom'

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
	has: 'has',
}

const tokenPattern = /([-!]?)(\+?)(\*?)(?:([a-z]+|_"[^"]*"|_[^\s:"]+):)?(?:"([^"]*)"?|(\S+))/gi

export function parseQuery(query: string): SearchTerm[] {
	const terms: SearchTerm[] = []
	for (const match of query.matchAll(tokenPattern)) {
		const [, negation, exact, regex, prefix, quoted, bare] = match
		const attribute = prefix?.startsWith('_') ? prefix.slice(1).replace(/^"(.*)"$/, '$1') : undefined
		const field = attribute !== undefined ? 'custom' : prefix ? fieldAliases[prefix.toLowerCase()] : 'default'
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
			regex: regex !== '',
			...(attribute !== undefined ? { attribute } : {}),
		})
	}
	return terms
}

function compile(term: SearchTerm): (text: string) => boolean {
	if (term.regex) {
		let pattern: RegExp
		try {
			pattern = new RegExp(term.value, 'i')
		} catch {
			return () => false
		}
		return (text) => pattern.test(text)
	}
	const needle = term.value.toLowerCase()
	if (needle.includes('*')) {
		return wildcard(needle, term.exact)
	}
	if (term.exact) {
		return (text) => text.toLowerCase() === needle
	}
	return (text) => text.toLowerCase().includes(needle)
}

/**
 * `*` stands for any run of characters. The parts between are searched left to
 * right, which takes linear time; the equivalent regular expression backtracks
 * and freezes the page on long fields of a shared database (`a*a*b`).
 */
function wildcard(needle: string, exact: boolean): (text: string) => boolean {
	const parts = needle.split('*')
	const first = parts[0]!
	const last = parts.at(-1)!
	const inner = exact ? parts.slice(1, -1) : parts
	return (text) => {
		const haystack = text.toLowerCase()
		let from = 0
		let to = haystack.length
		if (exact) {
			if (haystack.length < first.length + last.length || !haystack.startsWith(first) || !haystack.endsWith(last)) {
				return false
			}
			from = first.length
			to = haystack.length - last.length
		}
		for (const part of inner) {
			const index = haystack.indexOf(part, from)
			if (index < 0 || index + part.length > to) {
				return false
			}
			from = index + part.length
		}
		return true
	}
}

function candidates(entry: KdbxEntry, term: SearchTerm): string[] {
	switch (term.field) {
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
		case 'custom': {
			const name = term.attribute!.toLowerCase()
			return [...entry.fields.keys()].filter((key) => !isStandardField(key) && key.toLowerCase() === name).map((key) => getField(entry, key))
		}
		case 'is':
		case 'has':
			return []
	}
}

/** `is:` and `has:` flags; an unknown flag matches nothing. */
function flag(term: SearchTerm, now: Date): (entry: KdbxEntry) => boolean {
	const soon = new Date(now.getTime() + EXPIRING_DAYS * 86_400_000)
	const tests: Record<string, (entry: KdbxEntry) => boolean> = term.field === 'is'
		? {
				expired: (entry) => isExpired(entry, now),
				expiring: (entry) => !isExpired(entry, now) && entry.times.expires === true && entry.times.expiryTime !== undefined && entry.times.expiryTime <= soon,
				weak: (entry) => weakness(entry) !== undefined,
			}
		: {
				totp: (entry) => readTotp(entry) !== undefined,
				attachment: (entry) => entry.binaries.size > 0,
				tag: (entry) => entry.tags.length > 0,
				url: (entry) => getField(entry, StandardField.URL) !== '',
				notes: (entry) => getField(entry, StandardField.Notes) !== '',
				passkey: (entry) => [...entry.fields.keys()].some(isPasskeyField),
			}
	const name = term.value.toLowerCase()
	return tests[name] ?? tests[name.replace(/s$/, '')] ?? (() => false)
}

export function matcher(terms: SearchTerm[], now = new Date()): (entry: KdbxEntry) => boolean {
	const compiled = terms.map((term) => {
		if (term.field === 'is' || term.field === 'has') {
			return { term, test: flag(term, now) }
		}
		const matches = compile(term)
		return { term, test: (entry: KdbxEntry) => candidates(entry, term).some(matches) }
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
