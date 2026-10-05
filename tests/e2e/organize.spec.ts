import { expect, test } from '@playwright/test'
import { attempt, fetchFromStorage, keepassxcExport, keepassxcList, login, navigationActions, openInFiles, seedDatabase, unlock } from './helpers.ts'

test.beforeEach(async ({ page }) => {
	await login(page)
})

test('moves groups and changes icons in a way KeePassXC reads back', async ({ page }) => {
	const name = seedDatabase('keepassxc-password.kdbx', `e2e-organize-${Date.now()}.kdbx`)
	await openInFiles(page, name)
	await unlock(page)
	const navigation = page.locator('.app-navigation')
	await expect(navigation.getByRole('link', { name: 'Banking', exact: true })).toBeVisible()

	await navigationActions(page, 'Banking')
	await page.getByRole('menuitem', { name: 'Move group' }).click()
	const dialog = page.getByRole('dialog', { name: 'Move to group' })
	await dialog.getByRole('combobox').click()
	await page.locator('.vs__dropdown-option').filter({ hasText: /Internet$/ }).click()
	await dialog.getByRole('button', { name: 'Move' }).click()

	await navigation.getByRole('link', { name: 'Banking', exact: true }).click()
	await page.locator('.entry-list').getByText('Hausbank', { exact: true }).click()
	await page.getByRole('button', { name: 'Edit', exact: true }).click()
	await page.getByRole('button', { name: 'Choose icon' }).click()
	await page.getByRole('option', { name: 'Icon 61' }).click()
	await page.getByRole('button', { name: 'Save', exact: true }).click()
	await expect(page.locator('.entry-details h2')).toHaveText('Hausbank')

	// Both changes are autosaved separately; wait until the file has the later one, too.
	const iconOfHausbank = () => {
		const xml = keepassxcExport(fetchFromStorage(name))
		const entry = xml.slice(xml.lastIndexOf('<Entry>', xml.indexOf('<Value>Hausbank</Value>')))
		return /^<Entry>\s*<UUID>[^<]+<\/UUID>\s*<IconID>(\d+)<\/IconID>/.exec(entry)?.[1]
	}
	await expect.poll(() => attempt(() => iconOfHausbank() ?? ''), { timeout: 20_000 }).toBe('61')
	expect(keepassxcList(fetchFromStorage(name), '/Internet/Banking')).toContain('Hausbank')
})

test('lists weak and expired entries in the health check', async ({ page }) => {
	const name = seedDatabase('keepassxc-password.kdbx', `e2e-report-${Date.now()}.kdbx`)
	await openInFiles(page, name)
	await unlock(page)
	await navigationActions(page, name)
	await page.getByRole('menuitem', { name: 'Health check' }).click()

	const report = page.getByRole('dialog', { name: 'Database health check' })
	await expect(report.getByRole('heading', { name: 'Expired (1)' })).toBeVisible()
	await expect(report.getByRole('heading', { name: /Weak passwords/ })).toBeVisible()
	await report.getByText('Hausbank').click()
	await expect(page.locator('.entry-details h2')).toHaveText('Hausbank')
})
