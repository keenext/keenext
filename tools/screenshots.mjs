// Regenerates docs/screenshots from demo databases in the docker-compose Nextcloud (see README).
//   npm run build && docker compose up -d && node tools/screenshots.mjs
// The databases hold invented data (example.org/.com/.net addresses, password "demo").
import { chromium } from '@playwright/test'
import { DOMParser, XMLSerializer } from '@xmldom/xmldom'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { argon2id } from 'hash-wasm'
import * as kdbxweb from 'kdbxweb'

const CONTAINER = process.env.NEXTCLOUD_CONTAINER ?? 'keepass-extension-nextcloud-1'
const BASE_URL = process.env.NEXTCLOUD_URL ?? 'http://localhost:8091'
const FOLDER = 'Passwords'
const PASSWORD = 'demo'
const OUT = fileURLToPath(new URL('../docs/screenshots/', import.meta.url))

Object.assign(globalThis, { DOMParser, XMLSerializer })
kdbxweb.CryptoEngine.setArgon2Impl(async (password, salt, memory, iterations, length, parallelism) => {
	const hash = await argon2id({
		password: new Uint8Array(password),
		salt: new Uint8Array(salt),
		memorySize: memory,
		iterations,
		hashLength: length,
		parallelism,
		outputType: 'binary',
	})
	return hash.buffer
})

const { Icons } = kdbxweb.Consts
const secret = (text) => kdbxweb.ProtectedValue.fromString(text)
const daysFromNow = (days) => new Date(Date.now() + days * 86_400_000)

function addEntry(db, group, { title, user, password, url, icon, notes }) {
	const entry = db.createEntry(group)
	entry.fields.set('Title', title)
	entry.fields.set('UserName', user)
	entry.fields.set('Password', secret(password))
	if (url) {
		entry.fields.set('URL', url)
	}
	if (notes) {
		entry.fields.set('Notes', notes)
	}
	entry.icon = icon
	return entry
}

function newDatabase(name) {
	const db = kdbxweb.Kdbx.create(new kdbxweb.KdbxCredentials(secret(PASSWORD)), name)
	db.setKdf(kdbxweb.Consts.KdfId.Argon2id)
	db.header.kdfParameters.set('M', kdbxweb.VarDictionary.ValueType.UInt64, kdbxweb.Int64.from(8 * 1024 * 1024))
	db.header.kdfParameters.set('I', kdbxweb.VarDictionary.ValueType.UInt64, kdbxweb.Int64.from(2))
	db.header.dataCipherUuid = new kdbxweb.KdbxUuid(kdbxweb.Consts.CipherId.ChaCha20)
	const root = db.getDefaultGroup()
	root.name = 'Root'
	db.createRecycleBin()
	return { db, root }
}

async function familyDatabase() {
	const { db, root } = newDatabase('Family')
	const internet = db.createGroup(root, 'Internet')
	internet.icon = Icons.World
	const email = db.createGroup(root, 'Email')
	email.icon = Icons.EMail
	const home = db.createGroup(root, 'Home')
	home.icon = Icons.Home
	const finance = db.createGroup(root, 'Finance')
	finance.icon = Icons.Money

	const shop = addEntry(db, internet, {
		title: 'Online shop',
		user: 'alex@example.org',
		password: 'old-Pw-2025!shop',
		url: 'https://shop.example.com/login',
		icon: Icons.Package,
		notes: 'Delivery to the office on weekdays.\nThe support PIN is printed on the last invoice.',
	})
	shop.pushHistory()
	shop.fields.set('Password', secret('Rk7!vQ2#mXp9$Lw4'))
	shop.times.update()
	shop.fields.set('otp', secret('otpauth://totp/Shop:alex@example.org?secret=JBSWY3DPEHPK3PXP&issuer=Shop&period=30&digits=6'))
	shop.fields.set('Customer number', '4711-2026')
	shop.fields.set('Recovery codes', secret('7421-9983-1206-5547'))
	shop.tags = ['shopping', 'family']
	shop.binaries.set('invoice-2026-03.txt', await db.createBinary(new TextEncoder().encode('Invoice 2026-03 (demo data)\n').buffer))

	addEntry(db, internet, { title: 'Fediverse account', user: 'alex', password: 'Hm4$wT8!qZc1nVb7', url: 'https://social.example.net', icon: Icons.World })
	addEntry(db, internet, { title: 'Photo storage', user: 'alex@example.org', password: 'Fp3#kD9&sLx2eRt6', url: 'https://photos.example.com', icon: Icons.Digicam })
	addEntry(db, internet, { title: 'Library', user: 'reader-4821', password: 'Bk6!yN1$cVm8uPq3', url: 'https://library.example.net', icon: Icons.Book })
	const old = addEntry(db, internet, { title: 'Old forum account', user: 'alex', password: 'Zq2#hW7!tGd5jKs9', url: 'https://forum.example.org', icon: Icons.Key })
	old.times.expires = true
	old.times.expiryTime = daysFromNow(-30)

	addEntry(db, email, { title: 'Personal mail', user: 'alex@example.org', password: 'Vc8$mB3!rXn6aLw1', url: 'https://mail.example.org', icon: Icons.EMail })
	addEntry(db, email, { title: 'Family mail', user: 'family@example.org', password: 'Ty5!pH2#kQs9dFj4', url: 'https://mail.example.org', icon: Icons.EMailBox })

	addEntry(db, home, { title: 'Router admin', user: 'admin', password: 'Nw1#gR6$xCb8tMe3', url: 'http://192.168.1.1', icon: Icons.NetworkServer })
	addEntry(db, home, { title: 'Guest Wi-Fi', user: 'guest', password: 'sunny-harbor-meadow-lantern', icon: Icons.NetworkServer, notes: 'Printed on the card in the hallway.' })
	addEntry(db, home, { title: 'Printer', user: 'service', password: 'Ju9!dK4#wPz2hYn7', icon: Icons.Configuration })

	addEntry(db, finance, { title: 'Online bank', user: '40817623', password: 'Ls3$cV8!bNq5xTr2', url: 'https://bank.example.com', icon: Icons.Money })
	addEntry(db, finance, { title: 'Tax portal', user: 'alex.example', password: 'Gd7#fM1!zWk6sBu4', url: 'https://tax.example.org', icon: Icons.Money })
	return db
}

function smallDatabase(name, entries) {
	const { db, root } = newDatabase(name)
	for (const entry of entries) {
		addEntry(db, root, { icon: Icons.Key, ...entry })
	}
	return db
}

function inContainer(...args) {
	return execFileSync('docker', ['exec', '-u', 'www-data', CONTAINER, ...args], { encoding: 'utf8' })
}

async function seed() {
	const databases = {
		'family.kdbx': await familyDatabase(),
		'work.kdbx': smallDatabase('Work', [
			{ title: 'VPN', user: 'a.example', password: 'Qe4!mL9#rXc2vTb7', url: 'https://vpn.example.com' },
			{ title: 'Ticket system', user: 'a.example', password: 'Wd8$nK3!yPh5sGf1', url: 'https://tickets.example.com' },
		]),
		'servers.kdbx': smallDatabase('Servers', [
			{ title: 'Backup host', user: 'root', password: 'Xr2#cB7!tNm4gQz9', url: 'ssh://backup.example.net' },
		]),
	}
	const target = `/var/www/html/data/admin/files/${FOLDER}`
	inContainer('sh', '-c', `rm -rf "${target}" && mkdir -p "${target}"`)
	for (const [name, db] of Object.entries(databases)) {
		execFileSync('docker', ['exec', '-i', '-u', 'www-data', CONTAINER, 'sh', '-c', `cat > "${target}/${name}"`], {
			input: new Uint8Array(await db.save()),
		})
	}
	// Older timestamps keep the "Modified" column of the Files app readable.
	inContainer('sh', '-c', `touch -d '3 days ago' "${target}"/*.kdbx`)
	inContainer('php', 'occ', 'files:scan', '--path', `/admin/files/${FOLDER}`)
}

async function capture() {
	const browser = await chromium.launch({ channel: 'chrome' })
	const page = await (await browser.newContext({
		baseURL: BASE_URL,
		viewport: { width: 1440, height: 900 },
		locale: 'en-US',
	})).newPage()
	const shot = (name) => page.screenshot({ path: join(OUT, `${name}.png`) })

	await page.goto('/login')
	await page.locator('#user').fill('admin')
	await page.locator('#password').fill('admin')
	await page.locator('button[type="submit"]').click()
	await page.waitForURL(/\/apps\//)

	await page.goto(`/apps/files/files?dir=/${FOLDER}`)
	const row = page.locator('[data-cy-files-list-row-name="family.kdbx"]')
	await row.waitFor()
	await page.locator('[data-cy-files-list-row-name="servers.kdbx"]').waitFor()
	await page.waitForTimeout(800)
	await shot('files')

	await row.locator('[data-cy-files-list-row-name-link]').click()
	await page.waitForURL(/\/apps\/keenext\//)
	const password = page.getByLabel('Password', { exact: true })
	await password.focus()
	await page.waitForTimeout(400)
	await shot('unlock')

	await password.fill(PASSWORD)
	await page.getByRole('button', { name: 'Unlock', exact: true }).click()
	await page.getByRole('link', { name: 'Internet', exact: true }).click()
	await page.locator('.entry-list').getByText('Online shop', { exact: true }).first().click()
	const details = page.locator('.entry-details')
	await details.getByText('Recovery codes').first().waitFor()
	await page.waitForTimeout(800)
	await shot('entry')

	await details.getByRole('button', { name: 'Edit', exact: true }).click()
	await page.getByRole('button', { name: 'Generate password' }).click()
	await page.getByRole('dialog').getByText('Length:').waitFor()
	await page.waitForTimeout(500)
	await shot('generator')

	await browser.close()
}

await seed()
await capture()
console.log(`Screenshots written to ${OUT}`)
