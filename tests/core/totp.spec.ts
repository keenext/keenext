import { describe, expect, it } from 'vitest'
import { base32Decode, base32Encode, buildOtpUri, parseOtpUri, readTotp, totpCode, totpRemaining, type TotpConfig } from '@/core/totp'
import { KdbxEntry, KdbxGroup, KdbxMeta, ProtectedValue } from 'kdbxweb'

const ascii = (text: string) => new TextEncoder().encode(text)

describe('RFC 6238 test vectors', () => {
	const secrets = {
		'SHA-1': ascii('12345678901234567890'),
		'SHA-256': ascii('12345678901234567890123456789012'),
		'SHA-512': ascii('1234567890123456789012345678901234567890123456789012345678901234'),
	} as const
	const vectors: [number, Record<keyof typeof secrets, string>][] = [
		[59, { 'SHA-1': '94287082', 'SHA-256': '46119246', 'SHA-512': '90693936' }],
		[1111111109, { 'SHA-1': '07081804', 'SHA-256': '68084774', 'SHA-512': '25091201' }],
		[2000000000, { 'SHA-1': '69279037', 'SHA-256': '90698825', 'SHA-512': '38618901' }],
	]
	for (const [time, codes] of vectors) {
		for (const algorithm of Object.keys(secrets) as (keyof typeof secrets)[]) {
			it(`${algorithm} at ${time}`, async () => {
				const config: TotpConfig = { secret: secrets[algorithm], period: 30, digits: 8, algorithm, encoder: 'default' }
				expect(await totpCode(config, time * 1000)).toBe(codes[algorithm])
			})
		}
	}
})

describe('base32', () => {
	it('round-trips', () => {
		const bytes = ascii('Hello!ÿ')
		expect(base32Decode(base32Encode(bytes))).toEqual(bytes)
	})

	it('ignores case, spaces and padding', () => {
		expect(base32Decode('jbsw y3dp ehpk 3pxp====')).toEqual(base32Decode('JBSWY3DPEHPK3PXP'))
	})
})

describe('otpauth URIs', () => {
	it('parses parameters', () => {
		const config = parseOtpUri('otpauth://totp/GitHub:jan?secret=JBSWY3DPEHPK3PXP&period=60&digits=8&algorithm=SHA256&issuer=GitHub')
		expect(config).toMatchObject({ period: 60, digits: 8, algorithm: 'SHA-256', encoder: 'default' })
	})

	it('recognises the Steam encoder', async () => {
		const config = parseOtpUri('otpauth://totp/Steam:jan?secret=JBSWY3DPEHPK3PXP&encoder=steam')!
		expect(config.encoder).toBe('steam')
		expect(await totpCode(config, 0)).toMatch(/^[23456789BCDFGHJKMNPQRTVWXY]{5}$/)
	})

	it('rejects non-TOTP URIs', () => {
		expect(parseOtpUri('otpauth://hotp/x?secret=JBSWY3DPEHPK3PXP')).toBeUndefined()
		expect(parseOtpUri('https://example.org')).toBeUndefined()
		expect(parseOtpUri('not a uri')).toBeUndefined()
	})

	it('builds URIs that parse back', () => {
		const config: TotpConfig = { secret: base32Decode('JBSWY3DPEHPK3PXP'), period: 30, digits: 6, algorithm: 'SHA-1', encoder: 'default' }
		expect(parseOtpUri(buildOtpUri(config, 'GitHub:jan', 'GitHub'))).toEqual(config)
	})
})

describe('readTotp', () => {
	function entryWith(fields: Record<string, string>): KdbxEntry {
		const entry = KdbxEntry.create(KdbxMeta.create(), KdbxGroup.create('g'))
		for (const [key, value] of Object.entries(fields)) {
			entry.fields.set(key, ProtectedValue.fromString(value))
		}
		return entry
	}

	it('reads the KeePassXC otp field', () => {
		expect(readTotp(entryWith({ otp: 'otpauth://totp/x?secret=JBSWY3DPEHPK3PXP' }))?.digits).toBe(6)
	})

	it('reads legacy KeePassXC seed/settings with Steam', () => {
		expect(readTotp(entryWith({ 'TOTP Seed': 'JBSWY3DPEHPK3PXP', 'TOTP Settings': '30;S' }))).toMatchObject({ encoder: 'steam', digits: 5 })
	})

	it('reads KeePass 2.47+ TimeOtp fields', () => {
		const config = readTotp(entryWith({ 'TimeOtp-Secret-Base32': 'JBSWY3DPEHPK3PXP', 'TimeOtp-Length': '8', 'TimeOtp-Algorithm': 'HMAC-SHA-512' }))
		expect(config).toMatchObject({ digits: 8, algorithm: 'SHA-512', period: 30 })
	})

	it('returns undefined for broken secrets instead of throwing', () => {
		expect(readTotp(entryWith({ 'TOTP Seed': '!!!' }))).toBeUndefined()
	})
})

it('computes the remaining seconds of the current period', () => {
	const config: TotpConfig = { secret: new Uint8Array(10), period: 30, digits: 6, algorithm: 'SHA-1', encoder: 'default' }
	expect(totpRemaining(config, 0)).toBe(30)
	expect(totpRemaining(config, 29_500)).toBe(1)
	expect(totpRemaining(config, 45_000)).toBe(15)
})
