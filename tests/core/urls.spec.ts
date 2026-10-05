import { describe, expect, it } from 'vitest'
import { openableUrl } from '@/core/urls'

describe('openableUrl', () => {
	it('keeps web and mail links', () => {
		expect(openableUrl('https://example.org/login')).toBe('https://example.org/login')
		expect(openableUrl('mailto:jan@example.org')).toBe('mailto:jan@example.org')
	})

	it('adds https to bare hosts', () => {
		expect(openableUrl('example.org/login')).toBe('https://example.org/login')
		expect(openableUrl('  example.org ')).toBe('https://example.org/')
	})

	it('rejects scripts and local commands', () => {
		expect(openableUrl('javascript:alert(1)')).toBeUndefined()
		expect(openableUrl(' JavaScript:alert(1)')).toBeUndefined()
		expect(openableUrl('data:text/html,<script>alert(1)</script>')).toBeUndefined()
		expect(openableUrl('vbscript:msgbox')).toBeUndefined()
		expect(openableUrl('cmd://notepad.exe')).toBeUndefined()
		expect(openableUrl('file:///etc/passwd')).toBeUndefined()
	})

	it('ignores empty and unparsable values', () => {
		expect(openableUrl('')).toBeUndefined()
		expect(openableUrl('http://')).toBeUndefined()
	})
})
