import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { attempt, DIR, fetchFromStorage, keepassxcList, login, navigationActions, openInFiles, seedDatabase, unlock, withArgon2Iterations } from './helpers.ts'

test.beforeEach(async ({ page }) => {
	await login(page)
})

test('exports CSV as a download and imports it into another database', async ({ page }) => {
	const source = seedDatabase('keepassxc-password.kdbx', `e2e-export-${Date.now()}.kdbx`)
	await openInFiles(page, source)
	await unlock(page)
	await navigationActions(page, source)
	await page.getByRole('menuitem', { name: 'Export…' }).click()
	const exportDialog = page.getByRole('dialog', { name: 'Export database' })
	await exportDialog.getByText(/^CSV/).click()
	await exportDialog.getByText('I understand that the file is not encrypted').click()
	const [download] = await Promise.all([page.waitForEvent('download'), exportDialog.getByRole('button', { name: 'Download' }).click()])
	const csvPath = await download.path()
	expect(readFileSync(csvPath, 'utf8')).toContain('"Root/Internet","GitHub","jan@example.org","gh-secret-2"')

	const target = seedDatabase('keepassxc-password-keyfile.kdbx', `e2e-import-${Date.now()}.kdbx`)
	seedDatabase('keepassxc-keyfile.keyx', 'keepassxc-keyfile.keyx')
	await page.goto(`/apps/files/files?dir=/${DIR}`)
	await page.locator(`[data-cy-files-list-row-name="${target}"] [data-cy-files-list-row-name-link]`).click()
	await page.waitForURL(/\/apps\/keenext\//)
	await page.getByRole('button', { name: 'Key file from Nextcloud' }).click()
	const picker = page.getByRole('dialog', { name: 'Choose key file' })
	await picker.getByText('keepassxc-keyfile.keyx').click()
	await picker.getByRole('button', { name: 'Use as key file' }).click()
	await unlock(page)

	await navigationActions(page, target)
	await page.getByRole('menuitem', { name: 'Import…' }).click()
	const importDialog = page.getByRole('dialog', { name: /^Import into/ })
	await importDialog.locator('input[type="file"]').setInputFiles({ name: 'passwords.csv', mimeType: 'text/csv', buffer: readFileSync(csvPath) })
	await importDialog.getByRole('button', { name: 'Import', exact: true }).click()
	await expect(page.getByText('Imported 5 entries').first()).toBeVisible()

	const keyFile = `${process.cwd()}/tests/fixtures/keepassxc-keyfile.keyx`
	await expect.poll(() => attempt(() => keepassxcList(fetchFromStorage(target), '/Import passwords/Internet', { password: 'test', keyFile })), { timeout: 20_000 })
		.toContain('GitHub')
})

test('asks before importing a database with an unusually expensive key derivation', async ({ page }) => {
	const target = seedDatabase('keepassxc-password.kdbx', `e2e-import-costly-${Date.now()}.kdbx`)
	await openInFiles(page, target)
	await unlock(page)
	await navigationActions(page, target)
	await page.getByRole('menuitem', { name: 'Import…' }).click()
	const importDialog = page.getByRole('dialog', { name: /^Import into/ })
	await importDialog.locator('input[type="file"]').setInputFiles({
		name: 'costly.kdbx',
		mimeType: 'application/octet-stream',
		buffer: withArgon2Iterations('keepassxc-argon2id-chacha20.kdbx', 1_000_000n),
	})
	await importDialog.getByLabel('Password of the database to import').fill('test')
	await importDialog.getByRole('button', { name: 'Import', exact: true }).click()
	await expect(importDialog.getByText('unusually expensive key derivation (Argon2id, 8 MiB memory, 1,000,000 iterations)')).toBeVisible()

	const argon2Worker = page.waitForEvent('worker')
	await importDialog.getByRole('button', { name: 'Import anyway' }).click()
	await expect(importDialog.getByRole('button', { name: 'Importing…' })).toBeVisible()
	const workerClosed = new Promise((resolve) => argon2Worker.then((worker) => worker.on('close', resolve)))
	await importDialog.getByRole('button', { name: 'Cancel' }).click()
	await workerClosed
	await expect(importDialog).toBeHidden()
})

test('keeps the new-database dialog open with an error when the file exists', async ({ page }) => {
	const existing = seedDatabase('keepassxc-password.kdbx', `e2e-exists-${Date.now()}.kdbx`)
	await page.goto(`/apps/keenext/?new=1&dir=/${DIR}`)
	const dialog = page.getByRole('dialog', { name: 'New KeePass database' })
	await dialog.getByLabel('File name').fill(existing)
	await dialog.getByLabel('Master password', { exact: true }).fill('test')
	await dialog.getByLabel('Repeat master password').fill('test')
	await dialog.getByRole('button', { name: 'Create' }).click()
	await expect(dialog.getByText('A file with this name already exists')).toBeVisible()
})
