export type PreviewKind = 'image' | 'text'

/** Raster formats browsers show in <img>. SVG is left out: it may carry scripts and external references. */
const IMAGE_TYPES: Record<string, string> = {
	png: 'image/png',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	gif: 'image/gif',
	webp: 'image/webp',
	avif: 'image/avif',
	bmp: 'image/bmp',
	ico: 'image/x-icon',
}

const TEXT_EXTENSIONS = new Set('txt md log csv tsv json xml yml yaml toml ini conf cfg env pem crt cer csr key pub asc ovpn sh ps1 bat html htm'.split(' '))

const MAX_IMAGE_BYTES = 20 * 1024 * 1024
const MAX_TEXT_BYTES = 1024 * 1024

function extension(name: string): string {
	const dot = name.lastIndexOf('.')
	return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

/** How an attachment can be shown, judged by its name and size; undefined = download only. */
export function previewKind(name: string, size: number): PreviewKind | undefined {
	const ext = extension(name)
	if (IMAGE_TYPES[ext] && size <= MAX_IMAGE_BYTES) {
		return 'image'
	}
	if ((TEXT_EXTENSIONS.has(ext) || ext === '') && size <= MAX_TEXT_BYTES) {
		return 'text'
	}
	return undefined
}

export function imageType(name: string): string {
	return IMAGE_TYPES[extension(name)] ?? 'application/octet-stream'
}
