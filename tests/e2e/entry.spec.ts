import { expect, test } from '@playwright/test'
import { login, openInFiles, seedDatabase, unlock } from './helpers.ts'

test.beforeEach(async ({ page }) => {
	await login(page)
})

test('shows the history and the info of an entry on their own tabs', async ({ page }) => {
	const name = seedDatabase('keepassxc-password.kdbx', `e2e-entry-tabs-${Date.now()}.kdbx`)
	await openInFiles(page, name)
	await unlock(page)
	await page.getByRole('link', { name: 'Internet', exact: true }).click()
	await page.locator('.entry-list').getByText('GitHub', { exact: true }).first().click()
	const details = page.locator('.entry-details')

	await details.getByText('History (1)', { exact: true }).click()
	await expect(details.getByText('Current version')).toBeVisible()
	await expect(details.getByRole('button', { name: 'Restore this version' })).toBeVisible()
	await details.getByRole('button', { name: 'View', exact: true }).click()
	await expect(page.getByRole('dialog')).toContainText('Values that differ from the current version are marked.')
	await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).last().click()

	await details.getByText('Info', { exact: true }).click()
	await expect(details.locator('dl').getByText('Root › Internet')).toBeVisible()
	await expect(details.getByText('Entry ID')).toBeVisible()

	await details.getByText('Details', { exact: true }).click()
	await expect(details.getByText('jan@example.org')).toBeVisible()
})
