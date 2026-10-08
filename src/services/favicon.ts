import { fitSize } from '@/core/favicons'
import { getFavicon } from '@/services/api'

function decodeBase64(data: string): Uint8Array<ArrayBuffer> {
	const binary = atob(data)
	const bytes = new Uint8Array(binary.length)
	for (let index = 0; index < binary.length; index++) {
		bytes[index] = binary.charCodeAt(index)
	}
	return bytes
}

function loadImage(blob: Blob): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const url = URL.createObjectURL(blob)
		const image = new Image()
		image.onload = () => {
			URL.revokeObjectURL(url)
			resolve(image)
		}
		image.onerror = () => {
			URL.revokeObjectURL(url)
			reject(new Error('The image could not be decoded'))
		}
		image.src = url
	})
}

/**
 * The icon of the website at `address` as PNG. The browser decodes whatever the site serves
 * (ICO, SVG, JPEG …), so the database only ever holds PNG like KeePass writes it.
 */
export async function downloadFavicon(address: string): Promise<Uint8Array> {
	const { mime, data } = await getFavicon(address)
	const image = await loadImage(new Blob([decodeBase64(data)], { type: mime }))
	// SVG without a size reports 0 × 0.
	const { width, height } = fitSize(image.naturalWidth || 128, image.naturalHeight || 128)
	const canvas = document.createElement('canvas')
	canvas.width = width
	canvas.height = height
	canvas.getContext('2d')!.drawImage(image, 0, 0, width, height)
	const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
	if (!png) {
		throw new Error('The image could not be converted')
	}
	return new Uint8Array(await png.arrayBuffer())
}
