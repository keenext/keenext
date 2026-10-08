import { describe, expect, it } from 'vitest'
import { newDatabase } from '../helpers/databases.ts'
import { fitSize, iconFor, storeIcon } from '@/core/favicons'

describe('fitSize', () => {
	it('shrinks large images to the limit and keeps the aspect ratio', () => {
		expect(fitSize(512, 256)).toEqual({ width: 128, height: 64 })
	})

	it('does not enlarge small images', () => {
		expect(fitSize(16, 16)).toEqual({ width: 16, height: 16 })
	})
})

describe('iconFor / storeIcon', () => {
	it('reuses an identical icon instead of storing a second copy', () => {
		const db = newDatabase()
		const first = iconFor(db, new Uint8Array([1, 2, 3]))
		storeIcon(db, first)

		const again = iconFor(db, new Uint8Array([1, 2, 3]))
		const other = iconFor(db, new Uint8Array([4, 5]))

		expect(again.id).toBe(first.id)
		expect(other.id).not.toBe(first.id)
		storeIcon(db, again)
		expect(db.meta.customIcons.size).toBe(1)
	})
})
