import type { Kdbx, KdbxGroup } from 'kdbxweb'
import type { CustomField, EntryDraft } from './entries.ts'

import { Kdbx as KdbxClass, KdbxCredentials, ProtectedValue } from 'kdbxweb'
import { createEntry, emptyDraft, getField, isInRecycleBin, recycleBin, StandardField } from './entries.ts'
import { base32Decode, buildOtpUri, entryOtpUri, OTP_FIELD } from './totp.ts'

export interface ImportResult {
	/** Group the import was placed in; for a merge, the database root. */
	group: KdbxGroup
	entries: number
	groups: number
	/** The source was the same database (same root UUID) and was merged instead of copied. */
	merged: boolean
}

// ---------------------------------------------------------------- CSV

/** RFC 4180: quoted fields, doubled quotes, line breaks inside quotes, CRLF or LF. */
export function parseCsv(text: string): string[][] {
	const rows: string[][] = []
	let row: string[] = []
	let field = ''
	let quoted = false
	const input = text.replace(/^\uFEFF/, '')
	for (let i = 0; i < input.length; i++) {
		const char = input[i]!
		if (quoted) {
			if (char === '"' && input[i + 1] === '"') {
				field += '"'
				i++
			} else if (char === '"') {
				quoted = false
			} else {
				field += char
			}
		} else if (char === '"' && field === '') {
			quoted = true
		} else if (char === ',') {
			row.push(field)
			field = ''
		} else if (char === '\n' || char === '\r') {
			if (char === '\r' && input[i + 1] === '\n') {
				i++
			}
			row.push(field)
			rows.push(row)
			row = []
			field = ''
		} else {
			field += char
		}
	}
	if (field !== '' || row.length > 0) {
		row.push(field)
		rows.push(row)
	}
	return rows.filter((cells) => cells.some((cell) => cell !== ''))
}

function csvCell(value: string): string {
	return `"${value.replace(/"/g, '""')}"`
}

function isoSeconds(date: Date | undefined): string {
	return date ? date.toISOString().replace(/\.\d{3}Z$/, 'Z') : ''
}

function groupPath(group: KdbxGroup | undefined): string {
	const names: string[] = []
	for (let current = group; current; current = current.parentGroup) {
		names.unshift(current.name ?? '')
	}
	return names.join('/')
}

const CSV_HEADER = ['Group', 'Title', 'Username', 'Password', 'URL', 'Notes', 'TOTP', 'Icon', 'Last Modified', 'Created']

/** CSV with KeePassXC's columns. The recycle bin is left out. Contains all passwords in plain text. */
export function exportCsv(db: Kdbx): string {
	const lines = [CSV_HEADER.map(csvCell).join(',')]
	for (const entry of db.getDefaultGroup().allEntries()) {
		if (isInRecycleBin(db, entry)) {
			continue
		}
		lines.push([
			groupPath(entry.parentGroup),
			getField(entry, StandardField.Title),
			getField(entry, StandardField.UserName),
			getField(entry, StandardField.Password),
			getField(entry, StandardField.URL),
			getField(entry, StandardField.Notes),
			entryOtpUri(entry) ?? '',
			String(entry.icon ?? 0),
			isoSeconds(entry.times.lastModTime),
			isoSeconds(entry.times.creationTime),
		].map(csvCell).join(','))
	}
	return `${lines.join('\n')}\n`
}

/** KeePass 2 XML, the format KeePass and KeePassXC import. Contains all secrets in plain text. */
export function exportXml(db: Kdbx): Promise<string> {
	return db.saveXml(true)
}

const csvColumns: Record<string, keyof Pick<EntryDraft, 'title' | 'username' | 'password' | 'url' | 'notes'> | 'group' | 'totp' | 'tags' | 'modified' | 'created' | 'icon'> = {
	group: 'group',
	groups: 'group',
	folder: 'group',
	title: 'title',
	name: 'title',
	account: 'title',
	username: 'username',
	'user name': 'username',
	user: 'username',
	login: 'username',
	login_username: 'username',
	email: 'username',
	password: 'password',
	pass: 'password',
	login_password: 'password',
	url: 'url',
	'web site': 'url',
	website: 'url',
	login_uri: 'url',
	uri: 'url',
	notes: 'notes',
	note: 'notes',
	comments: 'notes',
	extra: 'notes',
	totp: 'totp',
	otp: 'totp',
	login_totp: 'totp',
	'one-time password': 'totp',
	tags: 'tags',
	'last modified': 'modified',
	created: 'created',
	icon: 'icon',
}

/** Normalises what other managers put into a TOTP column: otpauth URIs, steam:// URIs or bare base32 secrets. */
export function totpToOtpUri(value: string, label: string): string | undefined {
	const trimmed = value.trim()
	if (trimmed === '') {
		return undefined
	}
	if (/^otpauth:\/\//i.test(trimmed)) {
		return trimmed
	}
	const steam = /^steam:\/\/(.+)$/i.exec(trimmed)
	const secret = (steam ? steam[1]! : trimmed).replace(/\s/g, '')
	try {
		const bytes = base32Decode(secret)
		if (bytes.length === 0) {
			return undefined
		}
		return buildOtpUri({ secret: bytes, period: 30, digits: steam ? 5 : 6, algorithm: 'SHA-1', encoder: steam ? 'steam' : 'default' }, label)
	} catch {
		return undefined
	}
}

/** Finds or creates the group at `path` (segments) below `parent`. */
function ensureGroup(db: Kdbx, parent: KdbxGroup, path: string[], created: { count: number }): KdbxGroup {
	let current = parent
	for (const name of path) {
		let next = current.groups.find((group) => group.name === name)
		if (!next) {
			next = db.createGroup(current, name)
			created.count++
		}
		current = next
	}
	return current
}

function parseDate(value: string | undefined): Date | undefined {
	const date = value ? new Date(value) : undefined
	return date && !Number.isNaN(date.getTime()) ? date : undefined
}

/**
 * Imports a CSV file. Columns are recognised by their header (KeePassXC,
 * KeePass, Bitwarden, 1Password, browsers); unknown non-empty columns become
 * custom attributes. A group path shared by all rows as first segment (the
 * exporting database's root, as in KeePassXC exports) is dropped.
 */
export function importCsv(db: Kdbx, target: KdbxGroup, name: string, text: string): ImportResult {
	const [header, ...rows] = parseCsv(text)
	if (!header) {
		throw new Error('The file is empty')
	}
	const columns = header.map((cell) => csvColumns[cell.trim().toLowerCase()])
	if (!columns.includes('title') && !columns.includes('password')) {
		throw new Error('No title or password column found')
	}

	const paths = rows.map((row) => {
		const index = columns.indexOf('group')
		return index >= 0 ? (row[index] ?? '').split('/').map((segment) => segment.trim()).filter(Boolean) : []
	})
	const first = paths[0]?.[0]
	const dropRoot = first !== undefined && paths.every((path) => path.length >= 2 && path[0] === first)

	const group = db.createGroup(target, name)
	const created = { count: 1 }
	rows.forEach((row, index) => {
		const draft = emptyDraft()
		const customFields: CustomField[] = []
		let totp: string | undefined
		let modified: Date | undefined
		let createdAt: Date | undefined
		let icon: number | undefined
		row.forEach((value, column) => {
			const kind = columns[column]
			switch (kind) {
				case undefined:
					if (value !== '' && header[column]) {
						customFields.push({ key: header[column]!.trim(), value, protected: false })
					}
					break
				case 'group':
					break
				case 'totp':
					totp = value
					break
				case 'tags':
					draft.tags = value.split(/[;,]/).map((tag) => tag.trim()).filter(Boolean)
					break
				case 'modified':
					modified = parseDate(value)
					break
				case 'created':
					createdAt = parseDate(value)
					break
				case 'icon':
					icon = Number.parseInt(value, 10)
					break
				default:
					draft[kind] = value
			}
		})
		const otp = totp ? totpToOtpUri(totp, draft.username || draft.title) : undefined
		if (otp) {
			customFields.push({ key: OTP_FIELD, value: otp, protected: true })
		}
		draft.customFields = dedupeFields(customFields)
		if (icon !== undefined && Number.isFinite(icon) && icon >= 0) {
			draft.icon = icon
		}
		const path = paths[index] ?? []
		const parent = ensureGroup(db, group, dropRoot ? path.slice(1) : path, created)
		const entry = createEntry(db, parent, draft)
		if (createdAt) {
			entry.times.creationTime = createdAt
		}
		if (modified) {
			entry.times.lastModTime = modified
		}
	})
	return { group, entries: rows.length, groups: created.count, merged: false }
}

function dedupeFields(fields: CustomField[]): CustomField[] {
	const seen = new Map<string, number>()
	return fields.map((field) => {
		const count = seen.get(field.key) ?? 0
		seen.set(field.key, count + 1)
		return count === 0 ? field : { ...field, key: `${field.key} (${count + 1})` }
	})
}

// ---------------------------------------------------------------- Bitwarden

interface BitwardenField {
	name?: string | null
	value?: string | null
	/** 0 text, 1 hidden, 2 boolean, 3 linked */
	type?: number
}

interface BitwardenItem {
	/** 1 login, 2 secure note, 3 card, 4 identity, 5 SSH key */
	type: number
	name?: string | null
	notes?: string | null
	folderId?: string | null
	favorite?: boolean
	fields?: BitwardenField[] | null
	login?: { username?: string | null, password?: string | null, totp?: string | null, uris?: { uri?: string | null }[] | null } | null
	card?: Record<string, string | null> | null
	identity?: Record<string, string | null> | null
	sshKey?: Record<string, string | null> | null
}

interface BitwardenExport {
	encrypted?: boolean
	folders?: { id: string, name: string }[]
	items?: BitwardenItem[]
}

const BITWARDEN_SECRET_KEYS = new Set(['number', 'code', 'ssn', 'passportNumber', 'licenseNumber', 'privateKey'])

/**
 * Imports an unencrypted Bitwarden (or Vaultwarden) JSON export. Folders become
 * groups ("a/b" nested), additional URIs become KP2A_URL_n attributes like
 * KeePassXC's importer, card/identity/SSH data become attributes.
 */
export function importBitwarden(db: Kdbx, target: KdbxGroup, name: string, text: string): ImportResult {
	let data: BitwardenExport
	try {
		data = JSON.parse(text)
	} catch {
		throw new Error('Not a Bitwarden JSON export')
	}
	if (data.encrypted) {
		throw new Error('Encrypted Bitwarden exports are not supported; export unencrypted JSON instead')
	}
	if (!Array.isArray(data.items)) {
		throw new Error('Not a Bitwarden JSON export')
	}
	const folders = new Map((data.folders ?? []).map((folder) => [folder.id, folder.name]))
	const group = db.createGroup(target, name)
	const created = { count: 1 }
	for (const item of data.items) {
		const draft = emptyDraft()
		draft.title = item.name ?? ''
		draft.notes = item.notes ?? ''
		const customFields: CustomField[] = []
		if (item.login) {
			draft.username = item.login.username ?? ''
			draft.password = item.login.password ?? ''
			const uris = (item.login.uris ?? []).map((uri) => uri.uri ?? '').filter(Boolean)
			draft.url = uris[0] ?? ''
			uris.slice(1).forEach((uri, index) => customFields.push({ key: `KP2A_URL_${index + 1}`, value: uri, protected: false }))
			const otp = item.login.totp ? totpToOtpUri(item.login.totp, draft.username || draft.title) : undefined
			if (otp) {
				customFields.push({ key: OTP_FIELD, value: otp, protected: true })
			}
		}
		for (const [kind, values] of [['card', item.card], ['identity', item.identity], ['sshKey', item.sshKey]] as const) {
			for (const [key, value] of Object.entries(values ?? {})) {
				if (value) {
					customFields.push({ key: `${kind}.${key}`, value, protected: BITWARDEN_SECRET_KEYS.has(key) })
				}
			}
		}
		for (const field of item.fields ?? []) {
			if (field.name) {
				customFields.push({ key: field.name, value: field.value ?? '', protected: field.type === 1 })
			}
		}
		if (item.favorite) {
			draft.tags = ['favorite']
		}
		draft.customFields = dedupeFields(customFields)
		const folder = item.folderId ? folders.get(item.folderId) : undefined
		const parent = ensureGroup(db, group, folder ? folder.split('/').map((segment) => segment.trim()).filter(Boolean) : [], created)
		createEntry(db, parent, draft)
	}
	return { group, entries: data.items.length, groups: created.count, merged: false }
}

// ---------------------------------------------------------------- KeePass XML and KDBX

function copyTree(db: Kdbx, source: Kdbx, from: KdbxGroup, to: KdbxGroup, counts: { entries: number, groups: number }): void {
	const sourceBin = recycleBin(source)
	for (const entry of from.entries) {
		db.importEntry(entry, to, source)
		counts.entries++
	}
	for (const child of from.groups) {
		if (child === sourceBin) {
			continue
		}
		const copy = db.createGroup(to, child.name ?? '')
		copy.notes = child.notes
		copy.icon = child.icon
		copy.tags = [...child.tags]
		counts.groups++
		copyTree(db, source, child, copy, counts)
	}
}

/**
 * Brings another database into `db`. The same database (another copy of it,
 * recognised by the root group's UUID) is merged like KeePassXC's "Merge from
 * database"; anything else is copied into a new group, recycle bin excluded.
 */
export function importDatabase(db: Kdbx, target: KdbxGroup, name: string, source: Kdbx): ImportResult {
	if (source.getDefaultGroup().uuid.equals(db.getDefaultGroup().uuid)) {
		const before = [...db.getDefaultGroup().allEntries()].length
		db.merge(source)
		const after = [...db.getDefaultGroup().allEntries()].length
		return { group: db.getDefaultGroup(), entries: after - before, groups: 0, merged: true }
	}
	const group = db.createGroup(target, name)
	const counts = { entries: 0, groups: 1 }
	copyTree(db, source, source.getDefaultGroup(), group, counts)
	return { group, ...counts, merged: false }
}

/** Reads a KeePass 2 XML export (KeePass, KeePassXC) for `importDatabase`. */
export function loadXmlDatabase(text: string): Promise<Kdbx> {
	return KdbxClass.loadXml(text, new KdbxCredentials(ProtectedValue.fromString('')))
}
