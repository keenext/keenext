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

test('asks before another entry replaces an editor with unsaved changes', async ({ page }) => {
	const name = seedDatabase('keepassxc-password.kdbx', `e2e-entry-guard-${Date.now()}.kdbx`)
	await openInFiles(page, name)
	await unlock(page)
	await page.getByRole('link', { name: 'Internet', exact: true }).click()
	const list = page.locator('.entry-list')
	const details = page.locator('.entry-details')
	await list.getByText('GitHub', { exact: true }).first().click()
	await details.getByRole('button', { name: 'Edit', exact: true }).click()
	const title = details.getByRole('textbox', { name: 'Title', exact: true })
	await title.fill('GitHub edited')

	await list.getByText('GitHub API (reference)', { exact: true }).click()
	await page.getByRole('dialog', { name: 'Discard changes?' }).getByRole('button', { name: 'Keep editing' }).click()
	await expect(title).toHaveValue('GitHub edited')

	await list.getByText('GitHub API (reference)', { exact: true }).click()
	await page.getByRole('dialog', { name: 'Discard changes?' }).getByRole('button', { name: 'Discard changes', exact: true }).click()
	await expect(details.getByRole('heading', { name: 'GitHub API (reference)' })).toBeVisible()
	await expect(list.getByText('GitHub edited')).toHaveCount(0)
})
