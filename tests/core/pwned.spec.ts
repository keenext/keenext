import { describe, expect, it } from 'vitest'
import { newDatabase } from '../helpers/databases.ts'
import { createEntry, emptyDraft, getField } from '@/core/entries'
import { checkPwned } from '@/core/pwned'

// SHA-1("password") = 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8
const RANGE_5BAA6 = '1E4C9B93F3F0682250B6CF8331B7EE68FD8:9659365\r\n0000000000000000000000000000000000A:0\r\nFFFFF0000000000000000000000000000AB:3'

describe('checkPwned', () => {
	it('sends only hash prefixes and reports breached passwords with their count', async () => {
		const db = newDatabase()
		const root = db.getDefaultGroup()
		createEntry(db, root, { ...emptyDraft(), title: 'Weak', password: 'password' })
		createEntry(db, root, { ...emptyDraft(), title: 'Also weak', password: 'password' })
		createEntry(db, root, { ...emptyDraft(), title: 'Fine', password: 'k7#Lp2!xQ9vR' })
		createEntry(db, root, { ...emptyDraft(), title: 'Empty' })
		createEntry(db, root, { ...emptyDraft(), title: 'Reference', password: '{REF:P@I:00000000000000000000000000000000}' })

		const requested: string[] = []
		const results = await checkPwned(db, async (prefix) => {
			requested.push(prefix)
			return prefix === '5BAA6' ? RANGE_5BAA6 : ''
		})

		expect(requested).toHaveLength(2)
		expect(requested.every((prefix) => /^[0-9A-F]{5}$/.test(prefix))).toBe(true)
		expect(results.map((result) => [getField(result.entry, 'Title'), result.count]).sort()).toEqual([['Also weak', 9659365], ['Weak', 9659365]])
	})

	it('ignores padding lines with count 0', async () => {
		const db = newDatabase()
		createEntry(db, db.getDefaultGroup(), { ...emptyDraft(), title: 'x', password: 'password' })
		const results = await checkPwned(db, async () => '1E4C9B93F3F0682250B6CF8331B7EE68FD8:0')
		expect(results).toEqual([])
	})

	it('limits concurrent requests', async () => {
		const db = newDatabase()
		for (let i = 0; i < 20; i++) {
			createEntry(db, db.getDefaultGroup(), { ...emptyDraft(), title: `e${i}`, password: `password-${i}` })
		}
		let running = 0
		let peak = 0
		await checkPwned(db, async () => {
			running++
			peak = Math.max(peak, running)
			await new Promise((resolve) => setTimeout(resolve, 5))
			running--
			return ''
		}, 3)
		expect(peak).toBeLessThanOrEqual(3)
	})
})
