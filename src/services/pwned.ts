import type { RangeFetcher } from '@/core/pwned'

export const PWNED_API = 'https://api.pwnedpasswords.com'

/**
 * Plain fetch on purpose: @nextcloud/axios would attach Nextcloud's request
 * token to a third-party request. No cookies, no referrer; responses are
 * padded so their size does not hint at the prefix.
 */
export const fetchPwnedRange: RangeFetcher = async (prefix) => {
	const response = await fetch(`${PWNED_API}/range/${prefix}`, {
		headers: { 'Add-Padding': 'true' },
		credentials: 'omit',
		referrerPolicy: 'no-referrer',
	})
	if (!response.ok) {
		throw new Error(`Have I Been Pwned answered ${response.status}`)
	}
	return response.text()
}
