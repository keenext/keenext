import { expect, test } from '@playwright/test'
import { attempt, DIR, fetchFromStorage, keepassxcList, keepassxcShow, login, seedDatabase, storageHas, unlock } from './helpers.ts'

test.beforeEach(async ({ page }) => {
	await login(page)
})

test('creates a database from the Files "New" menu that KeePassXC can open', async ({ page }) => {
	const name = `e2e-new-${Date.now()}`
	await page.goto(`/apps/files/files?dir=/${DIR}`)
	await page.getByRole('button', { name: 'New', exact: true }).click()
	await page.getByRole('menuitem', { name: 'New KeePass database' }).click()
	await page.waitForURL(/\/apps\/keepassweb\//)

	const dialog = page.getByRole('dialog')
	await dialog.getByLabel('File name').fill(name)
	await dialog.getByLabel('Master password', { exact: true }).fill('test')
	await dialog.getByLabel('Repeat master password').fill('test')
	await dialog.getByRole('button', { name: 'Create' }).click()
	await expect(dialog).toBeHidden({ timeout: 30_000 })

	await page.getByRole('button', { name: 'New entry' }).click()
	await page.getByLabel('Title', { exact: true }).fill('First entry')
	await page.getByLabel('Password', { exact: true }).fill('first-password')
	await page.getByRole('button', { name: 'Save', exact: true }).click()
	await expect(page.locator('.entry-details h2')).toHaveText('First entry')

	expect(storageHas(`${name}.kdbx`)).toBe(true)
	await expect.poll(() => attempt(() => keepassxcShow(fetchFromStorage(`${name}.kdbx`), '/First entry', ['Password'])), { timeout: 20_000 })
		.toBe('first-password\n')
})

test('remembers the key file of a recently opened database', async ({ page }) => {
	const name = seedDatabase('keepassxc-password-keyfile.kdbx', `e2e-key-${Date.now()}.kdbx`)
	seedDatabase('keepassxc-keyfile.keyx', 'keepassxc-keyfile.keyx')
	await page.goto(`/apps/files/files?dir=/${DIR}`)
	await page.locator(`[data-cy-files-list-row-name="${name}"] [data-cy-files-list-row-name-link]`).click()
	await page.waitForURL(/\/apps\/keepassweb\//)

	await page.getByRole('button', { name: 'Key file from Nextcloud' }).click()
	const picker = page.getByRole('dialog', { name: 'Choose key file' })
	await picker.getByText('keepassxc-keyfile.keyx').click()
	await picker.getByRole('button', { name: 'Use as key file' }).click()
	await unlock(page)
	await expect(page.getByText('Keyfile entry')).toBeVisible({ timeout: 20_000 })

	// Reload without the database open, then reopen it from the recent list.
	await page.goto('/apps/keepassweb/')
	const recent = page.locator('.start__recent').getByRole('link', { name: new RegExp(name) })
	await expect(recent).toBeVisible()
	await expect(page.locator('.start__recent')).toContainText('key file: keepassxc-keyfile.keyx')
	await recent.click()
	await expect(page.locator('.key-file__name')).toHaveText('keepassxc-keyfile.keyx')
	await unlock(page)
	await expect(page.getByText('Keyfile entry')).toBeVisible({ timeout: 20_000 })
	expect(keepassxcList(fetchFromStorage(name), '/', { password: 'test', keyFile: `${process.cwd()}/tests/fixtures/keepassxc-keyfile.keyx` })).toContain('Keyfile entry')
})
