import { expect, test } from '@playwright/test'
import { attempt, fetchFromStorage, keepassxcExport, keepassxcList, keepassxcTotp, login, navigationActions, openInFiles, seedDatabase, unlock } from './helpers.ts'

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

test('moves an entry by dragging it onto a group', async ({ page }) => {
	const name = seedDatabase('keepassxc-password.kdbx', `e2e-drag-${Date.now()}.kdbx`)
	await openInFiles(page, name)
	await unlock(page)
	const navigation = page.locator('.app-navigation')
	await navigation.getByRole('link', { name: 'Banking', exact: true }).click()

	await page.locator('.entry-list').getByText('Hausbank', { exact: true })
		.dragTo(navigation.getByRole('link', { name: 'Internet', exact: true }))

	await expect(page.locator('.entry-list').getByText('Hausbank', { exact: true })).toBeHidden()
	await expect.poll(() => attempt(() => keepassxcList(fetchFromStorage(name), '/Internet')), { timeout: 20_000 })
		.toContain('Hausbank')
})

test('checks passwords against Have I Been Pwned with hash prefixes only', async ({ page }) => {
	const name = seedDatabase('keepassxc-password.kdbx', `e2e-pwned-${Date.now()}.kdbx`)
	const requests: { url: string, headers: Record<string, string> }[] = []
	await page.route('https://api.pwnedpasswords.com/range/*', async (route) => {
		requests.push({ url: route.request().url(), headers: route.request().headers() })
		// SHA-1("1234") = 7110EDA4D09E062AA5E4A390B0A572AC0D2C0220, the Hausbank PIN.
		const body = route.request().url().endsWith('/7110E') ? 'DA4D09E062AA5E4A390B0A572AC0D2C0220:2413945\r\n' : ''
		await route.fulfill({ status: 200, contentType: 'text/plain', body })
	})
	await openInFiles(page, name)
	await unlock(page)
	await navigationActions(page, name)
	await page.getByRole('menuitem', { name: 'Health check' }).click()

	const report = page.getByRole('dialog', { name: 'Database health check' })
	await report.getByRole('button', { name: 'Check with Have I Been Pwned' }).click()
	await expect(report.getByRole('heading', { name: 'Found in data breaches (1)' })).toBeVisible()
	await expect(report.getByText('Seen 2,413,945 times')).toBeVisible()

	expect(requests.length).toBeGreaterThan(0)
	for (const request of requests) {
		expect(request.url).toMatch(/\/range\/[0-9A-F]{5}$/)
		expect(request.headers['add-padding']).toBe('true')
		expect(request.headers.cookie).toBeUndefined()
		expect(request.headers.requesttoken).toBeUndefined()
	}
})

test('shows TOTP as QR code and reads it back from an image', async ({ page }) => {
	const name = seedDatabase('keepassxc-password.kdbx', `e2e-qr-${Date.now()}.kdbx`)
	await openInFiles(page, name)
	await unlock(page)
	const navigation = page.locator('.app-navigation')

	await navigation.getByRole('link', { name: 'Internet', exact: true }).click()
	await page.locator('.entry-list').getByText('GitHub', { exact: true }).click()
	await page.getByRole('button', { name: 'Show QR code' }).click()
	const qr = await page.getByRole('img', { name: 'QR code for the authenticator app' }).screenshot()
	await page.getByRole('dialog', { name: 'TOTP as QR code' }).getByRole('button', { name: 'Close' }).last().click()

	await navigation.getByRole('link', { name: 'Banking', exact: true }).click()
	await page.locator('.entry-list').getByText('Hausbank', { exact: true }).click()
	await page.getByRole('button', { name: 'Edit', exact: true }).click()
	await page.getByRole('button', { name: 'Set up TOTP' }).click()
	const setup = page.getByRole('dialog', { name: 'Set up TOTP' })
	await setup.locator('input[type="file"]').setInputFiles({ name: 'qr.png', mimeType: 'image/png', buffer: qr })
	await expect(setup.getByLabel('Secret key or otpauth:// link')).toHaveValue(/^otpauth:\/\/totp\/GitHub:jan%40example\.org\?secret=JBSWY3DPEHPK3PXP/)
	await setup.getByRole('button', { name: 'Save' }).click()
	await page.getByRole('button', { name: 'Save', exact: true }).click()

	// Same secret, so KeePassXC computes the same code for both entries.
	await expect.poll(() => attempt(() => {
		const file = fetchFromStorage(name)
		return String(keepassxcTotp(file, '/Banking/Hausbank') === keepassxcTotp(file, '/Internet/GitHub'))
	}), { timeout: 20_000 }).toBe('true')
})
