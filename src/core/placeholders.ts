import type { Kdbx, KdbxEntry } from 'kdbxweb'

import { getField, StandardField } from './entries.ts'

const MAX_DEPTH = 10

const refFieldCodes: Record<string, string> = {
	T: StandardField.Title,
	U: StandardField.UserName,
	P: StandardField.Password,
	A: StandardField.URL,
	N: StandardField.Notes,
}

const entryPlaceholders: Record<string, string> = {
	TITLE: StandardField.Title,
	USERNAME: StandardField.UserName,
	PASSWORD: StandardField.Password,
	URL: StandardField.URL,
	NOTES: StandardField.Notes,
}

const placeholderPattern = /\{(REF:([TUPANI])@([TUPANIO]):([^}]+)|S:([^}]+)|TITLE|USERNAME|PASSWORD|URL|NOTES)\}/gi

export function uuidToHex(entry: KdbxEntry): string {
	return [...new Uint8Array(entry.uuid.toBytes())].map((byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase()
}

/** KeePassXC semantics: exact, case-insensitive match; "O" searches custom fields. */
function findReferenced(db: Kdbx, searchIn: string, text: string): KdbxEntry | undefined {
	const needle = text.toLowerCase()
	for (const entry of db.getDefaultGroup().allEntries()) {
		if (searchIn === 'I') {
			if (uuidToHex(entry).toLowerCase() === needle) {
				return entry
			}
			continue
		}
		const values = searchIn === 'O'
			? [...entry.fields.keys()].filter((key) => !Object.values(refFieldCodes).includes(key)).map((key) => getField(entry, key))
			: [getField(entry, refFieldCodes[searchIn]!)]
		if (values.some((value) => value.toLowerCase() === needle)) {
			return entry
		}
	}
	return undefined
}

function wantedValue(entry: KdbxEntry, code: string): string {
	return code === 'I' ? uuidToHex(entry) : getField(entry, refFieldCodes[code]!)
}

export function hasPlaceholders(value: string): boolean {
	placeholderPattern.lastIndex = 0
	return placeholderPattern.test(value)
}

/** Resolves {REF:…}, {S:…} and the standard field placeholders; unknown ones are left as they are. */
export function resolvePlaceholders(db: Kdbx, entry: KdbxEntry, value: string, depth = 0): string {
	if (depth >= MAX_DEPTH || !value.includes('{')) {
		return value
	}
	return value.replace(placeholderPattern, (match, _body: string, wanted?: string, searchIn?: string, text?: string, custom?: string) => {
		let resolved: string | undefined
		let source = entry
		if (wanted && searchIn && text) {
			const target = findReferenced(db, searchIn.toUpperCase(), text)
			if (target) {
				source = target
				resolved = wantedValue(target, wanted.toUpperCase())
			}
		} else if (custom) {
			resolved = entry.fields.has(custom) ? getField(entry, custom) : undefined
		} else {
			resolved = getField(entry, entryPlaceholders[match.slice(1, -1).toUpperCase()]!)
		}
		return resolved === undefined ? match : resolvePlaceholders(db, source, resolved, depth + 1)
	})
}

export function resolvedField(db: Kdbx, entry: KdbxEntry, key: string): string {
	return resolvePlaceholders(db, entry, getField(entry, key))
}
