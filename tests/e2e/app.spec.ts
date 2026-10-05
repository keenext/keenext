import { expect, test } from '@playwright/test'
import { attempt, fetchFromStorage, keepassxcShow, login, openInFiles, seedDatabase, unlock } from './helpers.ts'

test.beforeEach(async ({ page }) => {
	await login(page)
})

test('opens a database from the Files app, edits an entry and saves it for KeePassXC', async ({ page }) => {
	const name = seedDatabase('keepassxc-password.kdbx', `e2e-${Date.now()}.kdbx`)
	await openInFiles(page, name)

	await unlock(page)
	await expect(page.getByRole('link', { name: 'Internet' })).toBeVisible()

	await page.getByRole('link', { name: 'Internet' }).click()
	await page.getByText('GitHub', { exact: true }).click()
	const details = page.locator('.entry-details')
	await expect(details.getByText('jan@example.org')).toBeVisible()
	await expect(details.getByText(/^\d{3} \d{3}$/)).toBeVisible()

	await page.getByRole('button', { name: 'Edit', exact: true }).click()
	await page.getByLabel('Password', { exact: true }).fill('changed-in-browser')
	await page.getByRole('button', { name: 'Save', exact: true }).click()
	await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible()

	await expect.poll(() => attempt(() => keepassxcShow(fetchFromStorage(name), '/Internet/GitHub', ['Password'])), { timeout: 20_000 })
		.toBe('changed-in-browser\n')
})

test('rejects a wrong password', async ({ page }) => {
	const name = seedDatabase('keepassxc-password.kdbx', `e2e-wrong-${Date.now()}.kdbx`)
	await openInFiles(page, name)
	await unlock(page, 'wrong')
	await expect(page.getByText('Wrong password or key file')).toBeVisible()
})
