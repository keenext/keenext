import { expect, test } from '@playwright/test'
import { login, seedDatabase, shareReadOnly, unlock } from './helpers.ts'

test('opens a database shared read-only without offering edits', async ({ page }) => {
	const name = seedDatabase('keepassxc-password.kdbx', `e2e-shared-${Date.now()}.kdbx`)
	shareReadOnly(name, 'reader', 'reader-password-123')

	await login(page, 'reader', 'reader-password-123')
	await page.goto('/apps/files/files?dir=/')
	await page.locator(`[data-cy-files-list-row-name="${name}"] [data-cy-files-list-row-name-link]`).click()
	await page.waitForURL(/\/apps\/keepassweb\//)

	await expect(page.getByText('You can only read this database')).toBeVisible()
	await unlock(page)
	await page.getByRole('link', { name: 'Internet' }).click()
	await page.locator('.entry-list').getByText('GitHub', { exact: true }).click()

	await expect(page.locator('.entry-details').getByText('jan@example.org')).toBeVisible()
	await expect(page.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0)
	await expect(page.getByRole('button', { name: 'New entry' })).toBeDisabled()
	await page.keyboard.press('Control+n')
	await expect(page.getByRole('heading', { name: 'New entry' })).toHaveCount(0)
})
