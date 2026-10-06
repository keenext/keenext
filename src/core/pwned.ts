import type { Kdbx, KdbxEntry } from 'kdbxweb'

import { getField, isInRecycleBin, StandardField } from './entries.ts'
import { hasPlaceholders } from './placeholders.ts'

/** Returns the body of `GET /range/{prefix}` of the Pwned Passwords API ("SUFFIX:COUNT" lines). */
export type RangeFetcher = (prefix: string) => Promise<string>

export interface PwnedResult {
	entry: KdbxEntry
	/** How often the password appears in known breaches. */
	count: number
}

async function sha1Hex(text: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text))
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase()
}

/** Padding lines from `Add-Padding: true` have count 0 and are ignored. */
function countInRange(range: string, suffix: string): number {
	for (const line of range.split('\n')) {
		const [lineSuffix, count] = line.trim().split(':')
		if (lineSuffix === suffix) {
			return Number.parseInt(count ?? '0', 10) || 0
		}
	}
	return 0
}

/**
 * Checks all passwords against Pwned Passwords with k-anonymity: only the
 * first five hex characters of each SHA-1 hash are sent, one request per
 * distinct prefix, at most `concurrency` at a time. Same skips as the health
 * check: recycle bin, empty passwords, references, QualityCheck off.
 */
export async function checkPwned(db: Kdbx, fetchRange: RangeFetcher, concurrency = 4): Promise<PwnedResult[]> {
	const byHash = new Map<string, KdbxEntry[]>()
	for (const entry of db.getDefaultGroup().allEntries()) {
		const password = getField(entry, StandardField.Password)
		if (isInRecycleBin(db, entry) || password === '' || hasPlaceholders(password) || entry.qualityCheck === false) {
			continue
		}
		const hash = await sha1Hex(password)
		byHash.set(hash, [...(byHash.get(hash) ?? []), entry])
	}

	const prefixes = [...new Set([...byHash.keys()].map((hash) => hash.slice(0, 5)))]
	const ranges = new Map<string, string>()
	let next = 0
	await Promise.all(Array.from({ length: Math.min(concurrency, prefixes.length) }, async () => {
		while (next < prefixes.length) {
			const prefix = prefixes[next++]!
			ranges.set(prefix, await fetchRange(prefix))
		}
	}))

	const results: PwnedResult[] = []
	for (const [hash, entries] of byHash) {
		const count = countInRange(ranges.get(hash.slice(0, 5)) ?? '', hash.slice(5))
		if (count > 0) {
			results.push(...entries.map((entry) => ({ entry, count })))
		}
	}
	return results
}
