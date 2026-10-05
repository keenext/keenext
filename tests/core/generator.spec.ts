import { describe, expect, it } from 'vitest'
import {
	CharacterGroups,
	DEFAULT_PASSWORD_OPTIONS,
	estimateStrength,
	generatePassphrase,
	generatePassword,
	loadWordlist,
	LOOK_ALIKE,
	passwordEntropy,
	randomInt,
} from '@/core/generator'

describe('randomInt', () => {
	it('stays in range and covers it', () => {
		const seen = new Set<number>()
		for (let i = 0; i < 2000; i++) {
			const value = randomInt(7)
			expect(value).toBeGreaterThanOrEqual(0)
			expect(value).toBeLessThan(7)
			seen.add(value)
		}
		expect(seen.size).toBe(7)
	})

	it('rejects invalid ranges', () => {
		expect(() => randomInt(0)).toThrow(RangeError)
		expect(() => randomInt(1.5)).toThrow(RangeError)
	})
})

describe('generatePassword', () => {
	it('honours length and excludes look-alikes', () => {
		for (let i = 0; i < 50; i++) {
			const password = generatePassword()
			expect(password).toHaveLength(DEFAULT_PASSWORD_OPTIONS.length)
			expect([...password].some((char) => LOOK_ALIKE.includes(char))).toBe(false)
		}
	})

	it('includes every selected group', () => {
		const options = { ...DEFAULT_PASSWORD_OPTIONS, length: 4, groups: ['lower', 'upper', 'digits', 'math'] as const, excludeLookAlike: false }
		for (let i = 0; i < 50; i++) {
			const password = generatePassword({ ...options, groups: [...options.groups] })
			for (const group of options.groups) {
				expect([...password].some((char) => CharacterGroups[group].includes(char))).toBe(true)
			}
		}
	})

	it('uses only explicitly included characters when no group is selected', () => {
		const password = generatePassword({ ...DEFAULT_PASSWORD_OPTIONS, groups: [], include: 'ab', excludeLookAlike: false })
		expect(password).toMatch(/^[ab]+$/)
	})

	it('respects exclusions', () => {
		const password = generatePassword({ ...DEFAULT_PASSWORD_OPTIONS, groups: ['digits'], exclude: '0123456789'.slice(1), excludeLookAlike: false, everyGroup: false })
		expect(password).toBe('0'.repeat(DEFAULT_PASSWORD_OPTIONS.length))
	})

	it('fails clearly on impossible options', () => {
		expect(() => generatePassword({ ...DEFAULT_PASSWORD_OPTIONS, groups: [] })).toThrow('No characters')
		expect(() => generatePassword({ ...DEFAULT_PASSWORD_OPTIONS, length: 2 })).toThrow('at least')
	})

	it('reports entropy from pool size', () => {
		expect(passwordEntropy({ ...DEFAULT_PASSWORD_OPTIONS, length: 10, groups: ['digits'], excludeLookAlike: false })).toBeCloseTo(10 * Math.log2(10))
	})
})

describe('passphrases', () => {
	it('loads the full EFF wordlist', async () => {
		const words = await loadWordlist()
		expect(words).toHaveLength(7776)
		expect(words[0]).toBe('abacus')
	})

	it('joins the requested number of words', async () => {
		const phrase = await generatePassphrase({ words: 5, separator: ' ', wordCase: 'title' })
		const words = phrase.split(' ')
		expect(words).toHaveLength(5)
		for (const word of words) {
			expect(word).toMatch(/^[A-Z][a-z-]*$/)
		}
	})
})

describe('estimateStrength', () => {
	it('ranks obvious cases', () => {
		expect(estimateStrength('').level).toBe('poor')
		expect(estimateStrength('aaaaaaaaaaaa').level).toBe('poor')
		expect(estimateStrength('abcdefgh').level).toBe('poor')
		expect(estimateStrength(generatePassword()).level).toMatch(/good|excellent/)
	})
})
