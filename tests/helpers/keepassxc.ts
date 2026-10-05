import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const fixturesDir = new URL('../fixtures/', import.meta.url).pathname

export const hasKeepassxc = spawnSync('keepassxc-cli', ['--version']).status === 0

export function fixture(name: string): Uint8Array {
	return new Uint8Array(readFileSync(join(fixturesDir, name)))
}

export function writeTemp(name: string, data: ArrayBuffer | Uint8Array): string {
	const dir = mkdtempSync(join(tmpdir(), 'keepassweb-'))
	const path = join(dir, name)
	writeFileSync(path, data instanceof Uint8Array ? data : new Uint8Array(data))
	return path
}

interface CliAuth {
	password?: string
	keyFile?: string
}

function authArgs({ password, keyFile }: CliAuth): string[] {
	const args = ['-q']
	if (keyFile) {
		args.push('-k', keyFile)
	}
	if (password === undefined) {
		args.push('--no-password')
	}
	return args
}

export function keepassxc(command: string, database: string, auth: CliAuth, extra: string[] = []): string {
	return execFileSync('keepassxc-cli', [command, ...authArgs(auth), database, ...extra], {
		input: auth.password !== undefined ? `${auth.password}\n` : '',
		encoding: 'utf8',
	})
}

/**
 * KeePassXC's XML export, canonicalised: values that change on every save are
 * dropped, CustomData items are sorted (they are a map) and whitespace-only text
 * between tags is removed. Two semantically identical databases compare equal.
 */
export function exportXml(database: string, auth: CliAuth): string {
	return keepassxc('export', database, auth, ['-f', 'xml'])
		.replace(/<Generator>.*?<\/Generator>/, '')
		.replace(/<HeaderHash>.*?<\/HeaderHash>/, '')
		.replace(/<Item>\s*<Key>_LAST_MODIFIED<\/Key>\s*<Value>.*?<\/Value>\s*<\/Item>/s, '')
		.replace(/>\s+</g, '><')
		.replace(/<CustomData>(.*?)<\/CustomData>/gs, (_, items: string) => {
			const sorted = items.match(/<Item>.*?<\/Item>/gs)?.sort() ?? []
			return `<CustomData>${sorted.join('')}</CustomData>`
		})
}
