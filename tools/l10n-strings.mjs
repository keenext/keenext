// Translatable strings in src/, in the key format of l10n/*.json:
// t('keenext', 'Text') → "Text", n('keenext', 'One', 'Many', …) → "_One_::_Many_".
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const quoted = String.raw`'((?:[^'\\]|\\.)*)'`
const singular = new RegExp(String.raw`\bt\(\s*'keenext',\s*${quoted}`, 'g')
const plural = new RegExp(String.raw`\bn\(\s*'keenext',\s*${quoted},\s*${quoted}`, 'g')
const unescape = (text) => text.replace(/\\'/g, "'")

function* files(dir) {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name)
		if (entry.isDirectory()) {
			yield* files(path)
		} else if (/\.(ts|vue)$/.test(entry.name)) {
			yield path
		}
	}
}

export function extractStrings(root = 'src') {
	const keys = new Set()
	for (const file of files(root)) {
		const source = readFileSync(file, 'utf8')
		for (const match of source.matchAll(singular)) {
			keys.add(unescape(match[1]))
		}
		for (const match of source.matchAll(plural)) {
			keys.add(`_${unescape(match[1])}_::_${unescape(match[2])}_`)
		}
	}
	return [...keys].sort()
}

if (import.meta.url === `file://${process.argv[1]}`) {
	console.log(JSON.stringify(extractStrings(), null, '\t'))
}
