/** Hands `data` to the browser as a download; nothing is stored in Nextcloud. */
export function downloadBlob(name: string, data: BlobPart, type = 'application/octet-stream'): void {
	const url = URL.createObjectURL(new Blob([data], { type }))
	const link = document.createElement('a')
	link.href = url
	link.download = name
	link.click()
	setTimeout(() => URL.revokeObjectURL(url), 1000)
}
