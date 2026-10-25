import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const json = (file: string) => JSON.parse(readFileSync(file, 'utf8')) as { version: string, packages: Record<string, { version: string }> }

// The release headings of CHANGELOG.md read "## 0.1.0 – 2026-10-25" or "## 0.1.0 – Unreleased"; the App Store matches the number at the start.
const changelog = readFileSync('CHANGELOG.md', 'utf8')
const latest = changelog.match(/^## (\d+\.\d+\.\d+(?:-[\w.]+)?) – (\S+)/m)

describe('version', () => {
	const version = readFileSync('appinfo/info.xml', 'utf8').match(/<version>([^<]+)<\/version>/)?.[1]

	it('is the same in info.xml, package.json and package-lock.json', () => {
		expect(json('package.json').version).toBe(version)
		expect(json('package-lock.json').version).toBe(version)
		expect(json('package-lock.json').packages['']?.version).toBe(version)
	})

	it('is the newest release heading in CHANGELOG.md', () => {
		expect(latest?.[1]).toBe(version)
	})

	it('has a release date in CHANGELOG.md once it is not marked Unreleased', () => {
		expect(latest?.[2]).toMatch(/^(Unreleased|\d{4}-\d{2}-\d{2})$/)
	})
})
