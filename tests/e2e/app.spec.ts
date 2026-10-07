import { expect, test } from '@playwright/test'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { attempt, DIR, fetchFromStorage, keepassxcShow, login, openInFiles, seedBytes, seedDatabase, unlock } from './helpers.ts'

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

/**
 * The fixture with Argon2 iterations raised in its header. The header's SHA-256 is
 * updated, the HMAC is not: loading gets as far as the key derivation, which then
 * runs (practically) forever.
 */
function withArgon2Iterations(fixtureName: string, iterations: bigint): Buffer {
	const file = Buffer.from(readFileSync(new URL(`../fixtures/${fixtureName}`, import.meta.url)))
	// KDBX 4 header fields: 1-byte id, 4-byte size; 11 is KdfParameters, 0 ends the header.
	for (let pos = 12; ;) {
		const id = file[pos]
		const start = pos + 5
		const end = start + file.readUInt32LE(pos + 1)
		if (id === 11) {
			// VarDictionary: 2-byte version, then items of type, key length, key, value length, value
			for (let item = start + 2; file[item] !== 0;) {
				const keyLength = file.readInt32LE(item + 1)
				const key = file.toString('utf8', item + 5, item + 5 + keyLength)
				const valueStart = item + 5 + keyLength + 4
				if (key === 'I') {
					file.writeBigUInt64LE(iterations, valueStart)
				}
				item = valueStart + file.readInt32LE(item + 5 + keyLength)
			}
		}
		if (id === 0) {
			createHash('sha256').update(file.subarray(0, end)).digest().copy(file, end)
			return file
		}
		pos = end
	}
}

test('asks before an unusually expensive key derivation and can cancel it', async ({ page }) => {
	const name = seedBytes(`e2e-costly-${Date.now()}.kdbx`, withArgon2Iterations('keepassxc-argon2id-chacha20.kdbx', 1_000_000n))
	await openInFiles(page, name)
	await unlock(page)
	await expect(page.getByText('unusually expensive key derivation (Argon2id, 8 MiB memory, 1,000,000 iterations)')).toBeVisible()

	const argon2Worker = page.waitForEvent('worker')
	await page.getByRole('button', { name: 'Unlock anyway' }).click()
	await expect(page.getByRole('button', { name: 'Unlocking…' })).toBeVisible()
	const workerClosed = new Promise((resolve) => argon2Worker.then((worker) => worker.on('close', resolve)))
	await page.getByRole('button', { name: 'Cancel' }).click()
	await workerClosed
	await expect(page.getByRole('button', { name: 'Unlock anyway' })).toBeEnabled()
	await expect(page.getByRole('button', { name: 'Cancel' })).toBeHidden()
})

test('opens a Twofish database written by KeePassXC', async ({ page }) => {
	const name = seedDatabase('keepassxc-argon2id-twofish.kdbx', `e2e-twofish-${Date.now()}.kdbx`)
	await openInFiles(page, name)
	await unlock(page)
	await page.getByRole('link', { name: 'Internet' }).click()
	await page.getByText('GitHub', { exact: true }).click()
	await expect(page.locator('.entry-details').getByText('jan@example.org')).toBeVisible()
})

test('shows the KeePass icon for .kdbx files in the Files app', async ({ page }) => {
	const name = seedDatabase('keepassxc-password.kdbx', `e2e-icon-${Date.now()}.kdbx`)
	await page.goto(`/apps/files/files?dir=/${DIR}`)
	const preview = page.locator(`[data-cy-files-list-row-name="${name}"] img.files-list__row-icon-preview`)
	await expect(preview).toHaveAttribute('src', /\/core\/preview\?fileId=/)
	await expect.poll(() => preview.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth)).toBeGreaterThan(0)
})
