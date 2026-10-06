import { encode } from 'uqr'

export interface QrPath {
	/** Width and height in modules, quiet zone included. */
	size: number
	/** SVG path covering the dark modules. */
	path: string
}

/** QR code as one SVG path, so it renders without v-html. */
export function qrPath(text: string): QrPath {
	const { size, data } = encode(text, { ecc: 'M', border: 2 })
	const segments: string[] = []
	data.forEach((row, y) => {
		row.forEach((dark, x) => {
			if (dark) {
				segments.push(`M${x} ${y}h1v1h-1z`)
			}
		})
	})
	return { size, path: segments.join('') }
}

/** Reads a QR code from an image (file, pasted screenshot). Resolves to undefined if none is found. */
export async function decodeQrImage(image: Blob): Promise<string | undefined> {
	const [{ default: jsQR }, bitmap] = await Promise.all([import('jsqr'), createImageBitmap(image)])
	try {
		const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
		const context = canvas.getContext('2d')
		if (!context) {
			return undefined
		}
		context.drawImage(bitmap, 0, 0)
		const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height)
		return jsQR(pixels.data, pixels.width, pixels.height, { inversionAttempts: 'attemptBoth' })?.data
	} finally {
		bitmap.close()
	}
}
