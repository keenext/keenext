import jsQR from 'jsqr'
import { describe, expect, it } from 'vitest'
import { qrPath } from '@/services/qr'

/** Rasterises the path's unit squares, then lets the decoder used for scanning read it back. */
function decode(text: string): string | undefined {
	const { size, path } = qrPath(text)
	const scale = 4
	const width = size * scale
	const pixels = new Uint8ClampedArray(width * width * 4).fill(255)
	for (const match of path.matchAll(/M(\d+) (\d+)h1v1h-1z/g)) {
		const [x, y] = [Number(match[1]), Number(match[2])]
		for (let dy = 0; dy < scale; dy++) {
			for (let dx = 0; dx < scale; dx++) {
				const offset = ((y * scale + dy) * width + x * scale + dx) * 4
				pixels.fill(0, offset, offset + 3)
			}
		}
	}
	return jsQR(pixels, width, width)?.data
}

describe('qrPath', () => {
	it('encodes otpauth URIs readably', () => {
		const uri = 'otpauth://totp/GitHub:jan%40example.org?secret=JBSWY3DPEHPK3PXP&period=30&digits=6&issuer=GitHub'
		expect(decode(uri)).toBe(uri)
	})

	it('includes a quiet zone', () => {
		const { size, path } = qrPath('x')
		expect(path).not.toMatch(/M0 |M\d+ 0h/)
		expect(size).toBeGreaterThan(21)
	})
})
