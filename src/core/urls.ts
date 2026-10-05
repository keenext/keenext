const OPENABLE_PROTOCOLS = new Set(['http:', 'https:', 'ftp:', 'ftps:', 'sftp:', 'ssh:', 'mailto:', 'tel:'])

/**
 * Returns a URL that is safe to use as a link target, or undefined.
 * Entry URLs come from the database file, which may have been shared by
 * someone else: `javascript:` and similar schemes would run in Nextcloud's
 * origin, and KeePass's `cmd://` cannot work in a browser. Values without a
 * scheme ("example.org/login") are treated as https, like KeePassXC does.
 */
export function openableUrl(value: string): string | undefined {
	const trimmed = value.trim()
	if (trimmed === '') {
		return undefined
	}
	const candidate = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`
	try {
		const url = new URL(candidate)
		return OPENABLE_PROTOCOLS.has(url.protocol) ? url.href : undefined
	} catch {
		return undefined
	}
}
