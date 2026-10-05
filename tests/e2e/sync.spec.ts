import { expect, test } from '@playwright/test'
import { attempt, editElsewhere, fetchFromStorage, keepassxcAdd, keepassxcList, keepassxcShow, login, openInFiles, seedDatabase, unlock } from './helpers.ts'

test.beforeEach(async ({ page }) => {
	await login(page)
})

test('merges a change made elsewhere while the database is open', async ({ page }) => {
	const name = seedDatabase('keepassxc-password.kdbx', `e2e-sync-${Date.now()}.kdbx`)
	await openInFiles(page, name)
	await unlock(page)
	await page.getByRole('link', { name: 'Internet' }).click()

	// Meanwhile a desktop client adds an entry and syncs the file.
	editElsewhere(name, (path) => keepassxcAdd(path, '/Internet/Added by KeePassXC', 'desktop'))

	// The browser edits another entry; saving hits the outdated ETag and must merge.
	await page.getByText('GitHub', { exact: true }).click()
	await page.getByRole('button', { name: 'Edit', exact: true }).click()
	await page.getByLabel('Username', { exact: true }).fill('changed@example.org')
	await page.getByRole('button', { name: 'Save', exact: true }).click()

	await expect(page.getByText(/were merged into/).first()).toBeVisible({ timeout: 20_000 })
	await expect(page.getByText('Added by KeePassXC')).toBeVisible()

	const stored = fetchFromStorage(name)
	expect(keepassxcList(stored, '/Internet')).toContain('Added by KeePassXC')
	expect(keepassxcShow(stored, '/Internet/GitHub', ['UserName'])).toBe('changed@example.org\n')
})

test('picks up a change made elsewhere without local edits', async ({ page }) => {
	const name = seedDatabase('keepassxc-password.kdbx', `e2e-pull-${Date.now()}.kdbx`)
	await openInFiles(page, name)
	await unlock(page)
	await page.getByRole('link', { name: 'Banking' }).click()

	editElsewhere(name, (path) => keepassxcAdd(path, '/Banking/Second card', 'desktop'))

	// Returning to the tab triggers a sync.
	await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
	await expect(page.getByText('Second card')).toBeVisible({ timeout: 20_000 })
})

test('keeps an edit that was open while a sync replaced the database', async ({ page }) => {
	const name = seedDatabase('keepassxc-password.kdbx', `e2e-stale-${Date.now()}.kdbx`)
	await openInFiles(page, name)
	await unlock(page)
	await page.getByRole('link', { name: 'Internet' }).click()
	await page.locator('.entry-list').getByText('GitHub', { exact: true }).click()
	await page.getByRole('button', { name: 'Edit', exact: true }).click()

	// While the editor is open, a desktop client changes the file and the app syncs it in.
	editElsewhere(name, (path) => keepassxcAdd(path, '/Internet/Added meanwhile', 'desktop'))
	await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
	await expect(page.locator('.entry-list').getByText('Added meanwhile')).toBeVisible({ timeout: 20_000 })

	await page.getByLabel('Username', { exact: true }).fill('edited@example.org')
	await page.getByRole('button', { name: 'Save', exact: true }).click()

	await expect.poll(() => attempt(() => keepassxcShow(fetchFromStorage(name), '/Internet/GitHub', ['UserName'])), { timeout: 20_000 })
		.toBe('edited@example.org\n')
	expect(keepassxcList(fetchFromStorage(name), '/Internet')).toContain('Added meanwhile')
})
