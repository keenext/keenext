import { describe, expect, it } from 'vitest'
import { imageType, previewKind } from '@/core/preview'

describe('previewKind', () => {
	it('shows raster images and text files up to a size, never SVG', () => {
		expect(previewKind('scan.JPG', 1000)).toBe('image')
		expect(imageType('scan.JPG')).toBe('image/jpeg')
		expect(previewKind('id_ed25519.pub', 100)).toBe('text')
		expect(previewKind('README', 100)).toBe('text')
		expect(previewKind('logo.svg', 100)).toBeUndefined()
		expect(previewKind('backup.zip', 100)).toBeUndefined()
		expect(previewKind('huge.txt', 2 * 1024 * 1024)).toBeUndefined()
	})
})
