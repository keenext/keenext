import { describe, expect, it } from 'vitest'
import { entryByTitle, newDatabase, openRichFixture } from '../helpers/databases.ts'
import { createEntry, emptyDraft, getField } from '@/core/entries'
import { healthReport } from '@/core/reports'

function summary(issues: ReturnType<typeof healthReport>) {
	return issues.map((issue) => `${issue.kind}:${getField(issue.entry, 'Title')}`).sort()
}

describe('healthReport', () => {
	it('finds weak and expired entries, ignoring references', async () => {
		const db = await openRichFixture()
		const issues = summary(healthReport(db, new Date('2026-01-01')))
		expect(issues).toContain('weak:Hausbank')
		expect(issues).toContain('expired:Alte Karte (abgelaufen)')
		expect(issues.some((issue) => issue.endsWith('GitHub API (reference)'))).toBe(false)
	})

	it('reports reused passwords on every entry that uses them', () => {
		const db = newDatabase()
		const root = db.getDefaultGroup()
		const strong = 'Xk3#pQ9!vR2@mN7$wL5^'
		createEntry(db, root, { ...emptyDraft(), title: 'A', password: strong })
		createEntry(db, root, { ...emptyDraft(), title: 'B', password: strong })
		createEntry(db, root, { ...emptyDraft(), title: 'C', password: 'Yt8&hJ4*kD6(sF1)gB3%' })
		expect(summary(healthReport(db))).toEqual(['reused:A', 'reused:B'])
	})

	it('warns about entries expiring within 30 days', () => {
		const db = newDatabase()
		const now = new Date('2026-01-01T00:00:00Z')
		createEntry(db, db.getDefaultGroup(), { ...emptyDraft(), title: 'Soon', expires: new Date('2026-01-11T00:00:00Z') })
		createEntry(db, db.getDefaultGroup(), { ...emptyDraft(), title: 'Later', expires: new Date('2026-06-01T00:00:00Z') })
		const issues = healthReport(db, now)
		expect(summary(issues)).toEqual(['expiring:Soon'])
		expect(issues[0]!.detail).toBe(10)
	})

	it('skips the recycle bin and entries excluded from quality checks', async () => {
		const db = await openRichFixture()
		db.remove(entryByTitle(db, 'Hausbank'))
		entryByTitle(db, 'Sonderzeichen <>&"\' 🔑').qualityCheck = false
		const issues = summary(healthReport(db, new Date('2026-01-01')))
		expect(issues.some((issue) => issue.includes('Hausbank') || issue.includes('Sonderzeichen'))).toBe(false)
	})
})
