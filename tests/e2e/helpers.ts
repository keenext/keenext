import type { Page } from '@playwright/test'

import { expect } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const CONTAINER = process.env.NEXTCLOUD_CONTAINER ?? 'keepass-extension-nextcloud-1'
export const USER = 'admin'
export const PASSWORD = 'admin'
/** Folder the tests work in; emptied before each run by global-setup.ts. */
export const DIR = 'E2E'
const storageDir = `/var/www/html/data/${USER}/files/${DIR}`

export async function login(page: Page, user = USER, password = PASSWORD): Promise<void> {
	await page.goto('/login')
	await page.locator('#user').fill(user)
	await page.locator('#password').fill(password)
	await page.locator('button[type="submit"]').click()
	await page.waitForURL(/\/apps\//)
}

export function occ(...args: string[]): string {
	return execFileSync('docker', ['exec', '-u', 'www-data', CONTAINER, 'php', 'occ', ...args], { encoding: 'utf8' })
}

export function resetStorage(): void {
	execFileSync('docker', ['exec', '-u', 'www-data', CONTAINER, 'sh', '-c', `rm -rf "${storageDir}" && mkdir -p "${storageDir}"`])
	occ('files:scan', '--path', `/${USER}/files/${DIR}`)
}

/** Puts a fixture into the test folder under the given name; returns that name. */
export function seedDatabase(fixture: string, name: string): string {
	execFileSync('docker', ['exec', '-u', 'www-data', CONTAINER, 'cp', `/fixtures/${fixture}`, `${storageDir}/${name}`])
	occ('files:scan', '--path', `/${USER}/files/${DIR}`)
	return name
}

/** Writes `data` into the test folder under the given name; returns that name. */
export function seedBytes(name: string, data: Uint8Array): string {
	execFileSync('docker', ['exec', '-i', '-u', 'www-data', CONTAINER, 'sh', '-c', `cat > "${storageDir}/${name}"`], {
		input: data,
	})
	occ('files:scan', '--path', `/${USER}/files/${DIR}`)
	return name
}

/** Copies a file out of the admin's storage to a temporary local path. */
export function fetchFromStorage(name: string): string {
	const dir = mkdtempSync(join(tmpdir(), 'keenext-e2e-'))
	const path = join(dir, name)
	const data = execFileSync('docker', ['exec', '-u', 'www-data', CONTAINER, 'cat', `${storageDir}/${name}`])
	writeFileSync(path, data)
	return path
}

export function keepassxcShow(path: string, entry: string, attributes: string[]): string {
	return execFileSync('keepassxc-cli', ['show', '-q', '-s', ...attributes.flatMap((attribute) => ['-a', attribute]), path, entry], {
		input: 'test\n',
		encoding: 'utf8',
	})
}

export async function openInFiles(page: Page, name: string): Promise<void> {
	await page.goto(`/apps/files/files?dir=/${DIR}`)
	const row = page.locator(`[data-cy-files-list-row-name="${name}"]`)
	await expect(row).toBeVisible()
	await row.locator('[data-cy-files-list-row-name-link]').click()
	await page.waitForURL(/\/apps\/keenext\//)
}

export async function unlock(page: Page, password = 'test'): Promise<void> {
	await page.getByLabel('Password', { exact: true }).fill(password)
	await page.getByRole('button', { name: 'Unlock', exact: true }).click()
}

/**
 * Edits a database in the admin's storage with keepassxc-cli, the way a
 * desktop client syncing the file would; the file gets a new ETag.
 */
export function editElsewhere(name: string, edit: (localPath: string) => void): void {
	const local = fetchFromStorage(name)
	edit(local)
	seedBytes(name, readFileSync(local))
}

export function keepassxcAdd(path: string, entry: string, username: string): void {
	execFileSync('keepassxc-cli', ['add', '-q', '-u', username, path, entry], { input: 'test\n' })
}

export function keepassxcList(path: string, group: string, auth: { keyFile?: string, password?: string } = { password: 'test' }): string {
	const args = ['ls', '-q']
	if (auth.keyFile) {
		args.push('-k', auth.keyFile)
	}
	if (auth.password === undefined) {
		args.push('--no-password')
	}
	return execFileSync('keepassxc-cli', [...args, path, group], { input: auth.password !== undefined ? `${auth.password}\n` : '', encoding: 'utf8' })
}

export function storageHas(name: string): boolean {
	try {
		execFileSync('docker', ['exec', '-u', 'www-data', CONTAINER, 'test', '-f', `${storageDir}/${name}`])
		return true
	} catch {
		return false
	}
}

/** For expect.poll, which stops at the first exception: failures become a value that does not match. */
export function attempt(read: () => string): string {
	try {
		return read()
	} catch (error) {
		return `(failed: ${error instanceof Error ? error.message.split('\n')[0] : String(error)})`
	}
}

export function keepassxcExport(path: string): string {
	return execFileSync('keepassxc-cli', ['export', '-q', '-f', 'xml', path], { input: 'test\n', encoding: 'utf8' })
}

/** Opens the action menu of a navigation item (database or group) by its name. */
export async function navigationActions(page: Page, name: string): Promise<void> {
	const item = page.locator('.app-navigation-entry').filter({ has: page.getByRole('link', { name, exact: true }) })
	await item.hover()
	await item.getByRole('button', { name: 'Actions' }).click()
}

/** A second user that the admin shares a file with, read-only. */
export function shareReadOnly(name: string, recipient: string, password: string): void {
	try {
		execFileSync('docker', ['exec', '-u', 'www-data', '-e', `OC_PASS=${password}`, CONTAINER, 'php', 'occ', 'user:add', '--password-from-env', recipient], { stdio: 'pipe' })
		execFileSync('docker', ['exec', '-u', 'www-data', CONTAINER, 'php', 'occ', 'user:setting', recipient, 'core', 'lang', 'en'])
	} catch {
		// Exists from an earlier run.
	}
	const base = process.env.NEXTCLOUD_URL ?? 'http://localhost:8091'
	execFileSync('curl', ['-sf', '-u', `${USER}:${PASSWORD}`, '-H', 'OCS-APIRequest: true', '-X', 'POST', `${base}/ocs/v2.php/apps/files_sharing/api/v1/shares`, '-d', `path=/${DIR}/${name}`, '-d', 'shareType=0', '-d', `shareWith=${recipient}`, '-d', 'permissions=1'])
}

export function keepassxcTotp(path: string, entry: string): string {
	return execFileSync('keepassxc-cli', ['show', '-q', '--totp', path, entry], { input: 'test\n', encoding: 'utf8' }).trim()
}
