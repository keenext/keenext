/** Uniform integer in [0, max) from the CSPRNG, without modulo bias. */
export function randomInt(max: number): number {
	if (!Number.isInteger(max) || max <= 0 || max > 2 ** 32) {
		throw new RangeError(`Invalid range ${max}`)
	}
	const limit = 2 ** 32 - (2 ** 32 % max)
	const buffer = new Uint32Array(1)
	for (;;) {
		crypto.getRandomValues(buffer)
		if (buffer[0]! < limit) {
			return buffer[0]! % max
		}
	}
}

function shuffle<T>(items: T[]): T[] {
	for (let i = items.length - 1; i > 0; i--) {
		const j = randomInt(i + 1)
		;[items[i], items[j]] = [items[j]!, items[i]!]
	}
	return items
}

/** Character groups as offered by KeePassXC's generator. */
export const CharacterGroups = {
	lower: 'abcdefghijklmnopqrstuvwxyz',
	upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
	digits: '0123456789',
	braces: '()[]{}',
	punctuation: '.,:;',
	quotes: '"\'',
	dashes: '-/\\_|',
	math: '!*+<=>?',
	logograms: '#$%&@^`~',
	extended: Array.from({ length: 94 }, (_, i) => String.fromCharCode(0xa1 + i)).join('').replace('­', ''),
} as const

export type CharacterGroup = keyof typeof CharacterGroups

/** Characters KeePassXC's "exclude look-alike characters" removes. */
export const LOOK_ALIKE = '0O1Il|8B6GDQ'

export interface PasswordOptions {
	length: number
	groups: CharacterGroup[]
	/** Additional characters, treated as their own group. */
	include: string
	exclude: string
	excludeLookAlike: boolean
	/** At least one character from each selected group. */
	everyGroup: boolean
}

export const DEFAULT_PASSWORD_OPTIONS: PasswordOptions = {
	length: 20,
	groups: ['lower', 'upper', 'digits', 'braces', 'punctuation', 'dashes', 'math', 'logograms'],
	include: '',
	exclude: '',
	excludeLookAlike: true,
	everyGroup: true,
}

function poolsFor(options: PasswordOptions): string[] {
	const excluded = new Set([...options.exclude, ...(options.excludeLookAlike ? LOOK_ALIKE : '')])
	const raw: string[] = options.groups.map((group) => CharacterGroups[group])
	if (options.include) {
		raw.push(options.include)
	}
	const seen = new Set<string>()
	return raw
		.map((pool) => [...pool].filter((char) => {
			if (excluded.has(char) || seen.has(char)) {
				return false
			}
			seen.add(char)
			return true
		}).join(''))
		.filter((pool) => pool.length > 0)
}

export function generatePassword(options: PasswordOptions = DEFAULT_PASSWORD_OPTIONS): string {
	const pools = poolsFor(options)
	const all = pools.join('')
	if (all.length === 0) {
		throw new Error('No characters selected')
	}
	if (options.everyGroup && options.length < pools.length) {
		throw new Error(`Length must be at least ${pools.length} to use every group`)
	}
	const chars: string[] = []
	if (options.everyGroup) {
		for (const pool of pools) {
			chars.push(pool[randomInt(pool.length)]!)
		}
	}
	while (chars.length < options.length) {
		chars.push(all[randomInt(all.length)]!)
	}
	return shuffle(chars).join('')
}

export function passwordEntropy(options: PasswordOptions): number {
	const size = poolsFor(options).join('').length
	return size > 0 ? options.length * Math.log2(size) : 0
}

export type WordCase = 'lower' | 'upper' | 'title' | 'mixed'

export interface PassphraseOptions {
	words: number
	separator: string
	wordCase: WordCase
}

export const DEFAULT_PASSPHRASE_OPTIONS: PassphraseOptions = {
	words: 7,
	separator: ' ',
	wordCase: 'lower',
}

let wordlist: Promise<string[]> | undefined

/** EFF large wordlist (7776 words), the KeePassXC default; loaded on first use. */
export function loadWordlist(): Promise<string[]> {
	wordlist ??= import('./wordlists/eff-large.txt?raw').then(({ default: text }) => text.split('\n').filter(Boolean))
	return wordlist
}

function applyCase(word: string, wordCase: WordCase): string {
	switch (wordCase) {
	case 'upper': return word.toUpperCase()
	case 'title': return word.charAt(0).toUpperCase() + word.slice(1)
	case 'mixed': return randomInt(2) === 0 ? word : word.toUpperCase()
	default: return word
	}
}

export async function generatePassphrase(options: PassphraseOptions = DEFAULT_PASSPHRASE_OPTIONS): Promise<string> {
	const words = await loadWordlist()
	return Array.from({ length: options.words }, () => applyCase(words[randomInt(words.length)]!, options.wordCase))
		.join(options.separator)
}

export async function passphraseEntropy(options: PassphraseOptions): Promise<number> {
	const words = await loadWordlist()
	return options.words * Math.log2(words.length) + (options.wordCase === 'mixed' ? options.words : 0)
}

export type StrengthLevel = 'poor' | 'weak' | 'good' | 'excellent'

/**
 * Rough entropy estimate for an arbitrary password (character pool × length,
 * discounted for repeats and simple sequences). Thresholds follow KeePassXC's
 * quality bar. Not a dictionary check.
 */
export function estimateStrength(password: string): { bits: number, level: StrengthLevel } {
	if (password.length === 0) {
		return { bits: 0, level: 'poor' }
	}
	let pool = 0
	if (/[a-z]/.test(password)) pool += 26
	if (/[A-Z]/.test(password)) pool += 26
	if (/[0-9]/.test(password)) pool += 10
	if (/[^a-zA-Z0-9]/.test(password)) pool += 33

	let effectiveLength = 0
	const chars = [...password]
	chars.forEach((char, i) => {
		const previous = chars[i - 1]
		const isRepeat = previous === char
		const isSequence = previous !== undefined && Math.abs(char.codePointAt(0)! - previous.codePointAt(0)!) === 1
		effectiveLength += isRepeat || isSequence ? 0.25 : 1
	})
	const bits = Math.round(effectiveLength * Math.log2(pool))
	const level: StrengthLevel = bits < 40 ? 'poor' : bits < 65 ? 'weak' : bits < 100 ? 'good' : 'excellent'
	return { bits, level }
}
