import { expect, test } from '@playwright/test'
import { attempt, fetchFromStorage, keepassxcExport, login, occ, openInFiles, seedDatabase, unlock } from './helpers.ts'

test.beforeEach(async ({ page }) => {
	await login(page)
})

test.afterAll(() => {
	occ('config:system:delete', 'allow_local_remote_servers')
})

test('downloads the favicon of an entry\'s website and saves it as custom icon', async ({ page }) => {
	// The server fetches the icon; the Nextcloud under test is the only site it can reach and it is local.
	occ('config:system:set', 'allow_local_remote_servers', '--type=boolean', '--value=true')
	const name = seedDatabase('keepassxc-password.kdbx', `e2e-favicon-${Date.now()}.kdbx`)
	const customIcons = () => keepassxcExport(fetchFromStorage(name)).match(/<Icon>/g)?.length ?? 0
	const before = customIcons()

	await openInFiles(page, name)
	await unlock(page)
	await page.getByRole('link', { name: 'Internet', exact: true }).click()
	await page.locator('.entry-list').getByText('GitHub API (reference)', { exact: true }).click()
	await page.getByRole('button', { name: 'Edit', exact: true }).click()
	await page.getByLabel('URL', { exact: true }).fill('http://localhost/login')
	await page.getByRole('button', { name: 'Download favicon' }).click()
	await expect(page.getByText('Favicon downloaded', { exact: true })).toBeVisible()
	await page.getByRole('button', { name: 'Save', exact: true }).click()
	await expect(page.locator('.entry-details h2')).toHaveText('GitHub API (reference)')

	await expect.poll(() => attempt(() => String(customIcons())), { timeout: 20_000 }).toBe(String(before + 1))
})

test('downloads the favicon from the entry\'s actions menu without editing', async ({ page }) => {
	occ('config:system:set', 'allow_local_remote_servers', '--type=boolean', '--value=true')
	const name = seedDatabase('keepassxc-password.kdbx', `e2e-favicon-menu-${Date.now()}.kdbx`)
	const customIcons = () => keepassxcExport(fetchFromStorage(name)).match(/<Icon>/g)?.length ?? 0
	const before = customIcons()

	await openInFiles(page, name)
	await unlock(page)
	await page.getByRole('link', { name: 'Internet', exact: true }).click()
	await page.locator('.entry-list').getByText('GitHub API (reference)', { exact: true }).click()
	await page.getByRole('button', { name: 'Edit', exact: true }).click()
	await page.getByLabel('URL', { exact: true }).fill('http://localhost/login')
	await page.getByRole('button', { name: 'Save', exact: true }).click()
	await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible()

	await page.getByRole('button', { name: 'More actions' }).click()
	await page.getByRole('menuitem', { name: 'Download favicon' }).click()
	await expect(page.getByText('Favicon downloaded', { exact: true })).toBeVisible()

	await expect.poll(() => attempt(() => String(customIcons())), { timeout: 20_000 }).toBe(String(before + 1))
})

test('says so when the website has no icon', async ({ page }) => {
	const name = seedDatabase('keepassxc-password.kdbx', `e2e-nofavicon-${Date.now()}.kdbx`)
	await openInFiles(page, name)
	await unlock(page)
	await page.getByRole('link', { name: 'Internet', exact: true }).click()
	await page.locator('.entry-list').getByText('GitHub', { exact: true }).first().click()
	await page.getByRole('button', { name: 'Edit', exact: true }).click()
	await page.getByLabel('URL', { exact: true }).fill('http://localhost:9/')
	await page.getByRole('button', { name: 'Download favicon' }).click()
	await expect(page.getByText('Could not find a favicon for this address', { exact: true })).toBeVisible()
})
