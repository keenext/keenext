import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, type Page } from '@playwright/test'

export const CONTAINER = process.env.NEXTCLOUD_CONTAINER ?? 'keepass-extension-nextcloud-1'
export const USER = 'admin'
export const PASSWORD = 'admin'

export async function login(page: Page): Promise<void> {
	await page.goto('/login')
	await page.locator('#user').fill(USER)
	await page.locator('#password').fill(PASSWORD)
	await page.locator('button[type="submit"]').click()
	await page.waitForURL(/\/apps\//)
}

function occ(...args: string[]): string {
	return execFileSync('docker', ['exec', '-u', 'www-data', CONTAINER, 'php', 'occ', ...args], { encoding: 'utf8' })
}

/** Puts a fixture into the admin's "KeePass" folder under a unique name; returns that name. */
export function seedDatabase(fixture: string, name: string): string {
	execFileSync('docker', ['exec', '-u', 'www-data', CONTAINER, 'sh', '-c',
		`mkdir -p /var/www/html/data/${USER}/files/KeePass && cp /fixtures/${fixture} "/var/www/html/data/${USER}/files/KeePass/${name}"`])
	occ('files:scan', '--path', `/${USER}/files/KeePass`)
	return name
}

/** Copies a file out of the admin's storage to a temporary local path. */
export function fetchFromStorage(name: string): string {
	const dir = mkdtempSync(join(tmpdir(), 'keepassweb-e2e-'))
	const path = join(dir, name)
	const data = execFileSync('docker', ['exec', '-u', 'www-data', CONTAINER, 'cat', `/var/www/html/data/${USER}/files/KeePass/${name}`])
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
	await page.goto('/apps/files/files?dir=/KeePass')
	const row = page.locator(`[data-cy-files-list-row-name="${name}"]`)
	await expect(row).toBeVisible()
	await row.locator('[data-cy-files-list-row-name-link]').click()
	await page.waitForURL(/\/apps\/keepassweb\//)
}

export async function unlock(page: Page, password = 'test'): Promise<void> {
	await page.getByLabel('Password', { exact: true }).fill(password)
	await page.getByRole('button', { name: 'Unlock', exact: true }).click()
}
