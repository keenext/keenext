import type { Kdbx, KdbxEntry } from 'kdbxweb'
import type { StrengthLevel } from './generator.ts'

import { getField, isExpired, isInRecycleBin, StandardField } from './entries.ts'
import { estimateStrength } from './generator.ts'
import { hasPlaceholders } from './placeholders.ts'

export interface HealthIssue {
	entry: KdbxEntry
	kind: 'weak' | 'reused' | 'expired' | 'expiring'
	/** weak: strength level; reused: number of entries sharing the password; expiring: days left */
	detail: StrengthLevel | number
}

export const EXPIRING_DAYS = 30

/**
 * KeePassXC's database health check: weak and reused passwords, expired and
 * soon expiring entries. Skips the recycle bin, empty passwords, references
 * and entries whose "QualityCheck" is turned off.
 */
export function healthReport(db: Kdbx, now = new Date()): HealthIssue[] {
	const issues: HealthIssue[] = []
	const byPassword = new Map<string, KdbxEntry[]>()
	const soon = new Date(now.getTime() + EXPIRING_DAYS * 86_400_000)

	for (const entry of db.getDefaultGroup().allEntries()) {
		if (isInRecycleBin(db, entry)) {
			continue
		}
		if (isExpired(entry, now)) {
			issues.push({ entry, kind: 'expired', detail: 0 })
		} else if (entry.times.expires && entry.times.expiryTime && entry.times.expiryTime <= soon) {
			const days = Math.ceil((entry.times.expiryTime.getTime() - now.getTime()) / 86_400_000)
			issues.push({ entry, kind: 'expiring', detail: days })
		}

		const password = getField(entry, StandardField.Password)
		if (password === '' || hasPlaceholders(password) || entry.qualityCheck === false) {
			continue
		}
		const { level } = estimateStrength(password)
		if (level === 'poor' || level === 'weak') {
			issues.push({ entry, kind: 'weak', detail: level })
		}
		byPassword.set(password, [...(byPassword.get(password) ?? []), entry])
	}

	for (const entries of byPassword.values()) {
		if (entries.length > 1) {
			for (const entry of entries) {
				issues.push({ entry, kind: 'reused', detail: entries.length })
			}
		}
	}
	return issues
}
