import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
// @ts-expect-error plain JS tool without types
import { extractStrings } from '../tools/l10n-strings.mjs'

const used: string[] = extractStrings()
const languages = readdirSync('l10n').filter((file) => file.endsWith('.json'))

describe.each(languages)('l10n/%s', (file) => {
	const { translations } = JSON.parse(readFileSync(`l10n/${file}`, 'utf8')) as { translations: Record<string, string | string[]> }

	it('translates every string used in src/', () => {
		expect(used.filter((key) => !(key in translations))).toEqual([])
	})

	it('has no translations for strings that are gone', () => {
		expect(Object.keys(translations).filter((key) => !used.includes(key))).toEqual([])
	})

	it('keeps all placeholders', () => {
		const placeholders = (text: string) => [...new Set([...text.matchAll(/\{\w+\}/g)].map((match) => match[0]))].sort()
		const broken = Object.entries(translations).filter(([key, value]) => {
			const expected = placeholders(key)
			return [value].flat().some((text) => placeholders(text).join() !== expected.join())
		})
		expect(broken.map(([key]) => key)).toEqual([])
	})

	it('has an up-to-date .js bundle', () => {
		const script = readFileSync(`l10n/${file.replace(/\.json$/, '.js')}`, 'utf8')
		for (const key of Object.keys(translations)) {
			expect(script).toContain(JSON.stringify(key))
		}
	})
})
