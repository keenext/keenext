import type { KdbxEntry } from 'kdbxweb'

import { getField } from './entries.ts'

export type TotpAlgorithm = 'SHA-1' | 'SHA-256' | 'SHA-512'

export interface TotpConfig {
	secret: Uint8Array
	period: number
	digits: number
	algorithm: TotpAlgorithm
	encoder: 'default' | 'steam'
}

/** Field KeePassXC (2.6+) stores the otpauth:// URI in. */
export const OTP_FIELD = 'otp'

const STEAM_ALPHABET = '23456789BCDFGHJKMNPQRTVWXY'
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function base32Decode(input: string): Uint8Array {
	const clean = input.toUpperCase().replace(/[\s=-]/g, '')
	const bytes: number[] = []
	let buffer = 0
	let bits = 0
	for (const char of clean) {
		const value = BASE32_ALPHABET.indexOf(char)
		if (value < 0) {
			throw new Error(`Invalid base32 character "${char}"`)
		}
		buffer = (buffer << 5) | value
		bits += 5
		if (bits >= 8) {
			bits -= 8
			bytes.push((buffer >> bits) & 0xff)
		}
	}
	return new Uint8Array(bytes)
}

export function base32Encode(bytes: Uint8Array): string {
	let output = ''
	let buffer = 0
	let bits = 0
	for (const byte of bytes) {
		buffer = (buffer << 8) | byte
		bits += 8
		while (bits >= 5) {
			bits -= 5
			output += BASE32_ALPHABET[(buffer >> bits) & 0x1f]
		}
	}
	if (bits > 0) {
		output += BASE32_ALPHABET[(buffer << (5 - bits)) & 0x1f]
	}
	return output
}

function normalizeAlgorithm(value: string | null | undefined): TotpAlgorithm {
	const upper = (value ?? '').toUpperCase().replace(/^HMAC-?/, '').replace('-', '')
	if (upper === 'SHA256') {
		return 'SHA-256'
	}
	if (upper === 'SHA512') {
		return 'SHA-512'
	}
	return 'SHA-1'
}

export function parseOtpUri(uri: string): TotpConfig | undefined {
	let url: URL
	try {
		url = new URL(uri.trim())
	} catch {
		return undefined
	}
	if (url.protocol !== 'otpauth:' || url.hostname.toLowerCase() !== 'totp') {
		return undefined
	}
	const secret = url.searchParams.get('secret')
	if (!secret) {
		return undefined
	}
	const steam = url.searchParams.get('encoder')?.toLowerCase() === 'steam'
	return {
		secret: base32Decode(secret),
		period: positiveInt(url.searchParams.get('period'), 30),
		digits: steam ? 5 : positiveInt(url.searchParams.get('digits'), 6),
		algorithm: normalizeAlgorithm(url.searchParams.get('algorithm')),
		encoder: steam ? 'steam' : 'default',
	}
}

function positiveInt(value: string | null | undefined, fallback: number): number {
	const parsed = Number.parseInt(value ?? '', 10)
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function readLegacyKeePassXC(entry: KdbxEntry): TotpConfig | undefined {
	const seed = getField(entry, 'TOTP Seed')
	if (!seed) {
		return undefined
	}
	// "TOTP Settings" is "period;digits" where digits may be "S" for Steam.
	const [period, digits] = getField(entry, 'TOTP Settings').split(';')
	const steam = digits?.trim().toUpperCase() === 'S'
	return {
		secret: base32Decode(seed),
		period: positiveInt(period, 30),
		digits: steam ? 5 : positiveInt(digits, 6),
		algorithm: 'SHA-1',
		encoder: steam ? 'steam' : 'default',
	}
}

function readKeePass(entry: KdbxEntry): TotpConfig | undefined {
	let secret: Uint8Array | undefined
	const base32 = getField(entry, 'TimeOtp-Secret-Base32')
	const hex = getField(entry, 'TimeOtp-Secret-Hex')
	const base64 = getField(entry, 'TimeOtp-Secret-Base64')
	const utf8 = getField(entry, 'TimeOtp-Secret')
	if (base32) {
		secret = base32Decode(base32)
	} else if (hex) {
		secret = new Uint8Array((hex.replace(/\s/g, '').match(/../g) ?? []).map((pair) => Number.parseInt(pair, 16)))
	} else if (base64) {
		secret = Uint8Array.from(atob(base64.replace(/\s/g, '')), (char) => char.charCodeAt(0))
	} else if (utf8) {
		secret = new TextEncoder().encode(utf8)
	}
	if (!secret) {
		return undefined
	}
	return {
		secret,
		period: positiveInt(getField(entry, 'TimeOtp-Period'), 30),
		digits: positiveInt(getField(entry, 'TimeOtp-Length'), 6),
		algorithm: normalizeAlgorithm(getField(entry, 'TimeOtp-Algorithm')),
		encoder: 'default',
	}
}

export function readTotp(entry: KdbxEntry): TotpConfig | undefined {
	try {
		const uri = getField(entry, OTP_FIELD)
		return (uri ? parseOtpUri(uri) : undefined) ?? readLegacyKeePassXC(entry) ?? readKeePass(entry)
	} catch {
		return undefined
	}
}

export function buildOtpUri(config: TotpConfig, label: string, issuer?: string): string {
	const params = new URLSearchParams({ secret: base32Encode(config.secret) })
	if (config.period !== 30) {
		params.set('period', String(config.period))
	}
	if (config.encoder === 'steam') {
		params.set('encoder', 'steam')
	} else if (config.digits !== 6) {
		params.set('digits', String(config.digits))
	}
	if (config.algorithm !== 'SHA-1') {
		params.set('algorithm', config.algorithm.replace('-', ''))
	}
	if (issuer) {
		params.set('issuer', issuer)
	}
	return `otpauth://totp/${encodeURIComponent(label)}?${params.toString()}`
}

export async function hotp(config: Pick<TotpConfig, 'secret' | 'digits' | 'algorithm' | 'encoder'>, counter: number): Promise<string> {
	const key = await crypto.subtle.importKey('raw', config.secret as Uint8Array<ArrayBuffer>, { name: 'HMAC', hash: config.algorithm }, false, ['sign'])
	const message = new ArrayBuffer(8)
	const view = new DataView(message)
	view.setUint32(0, Math.floor(counter / 2 ** 32))
	view.setUint32(4, counter >>> 0)
	const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, message))
	const offset = mac[mac.length - 1]! & 0x0f
	let code = ((mac[offset]! & 0x7f) << 24)
		| (mac[offset + 1]! << 16)
		| (mac[offset + 2]! << 8)
		| mac[offset + 3]!

	if (config.encoder === 'steam') {
		let output = ''
		for (let i = 0; i < config.digits; i++) {
			output += STEAM_ALPHABET[code % STEAM_ALPHABET.length]
			code = Math.floor(code / STEAM_ALPHABET.length)
		}
		return output
	}
	return String(code % 10 ** config.digits).padStart(config.digits, '0')
}

export function totpCode(config: TotpConfig, now = Date.now()): Promise<string> {
	return hotp(config, Math.floor(now / 1000 / config.period))
}

/** Seconds until the current code expires. */
export function totpRemaining(config: TotpConfig, now = Date.now()): number {
	const seconds = now / 1000
	return Math.ceil(config.period - (seconds % config.period))
}
