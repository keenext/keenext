import type { Kdbx, KdbxBinary, KdbxBinaryWithHash, KdbxEntry, KdbxEntryField, KdbxGroup } from 'kdbxweb'

import { KdbxUuid, ProtectedValue } from 'kdbxweb'

export const StandardField = {
	Title: 'Title',
	UserName: 'UserName',
	Password: 'Password',
	URL: 'URL',
	Notes: 'Notes',
} as const

const standardFieldNames: ReadonlySet<string> = new Set(Object.values(StandardField))

export function isStandardField(key: string): boolean {
	return standardFieldNames.has(key)
}

export function fieldText(value: KdbxEntryField | undefined): string {
	if (value === undefined) {
		return ''
	}
	return typeof value === 'string' ? value : value.getText()
}

export function getField(entry: KdbxEntry, key: string): string {
	return fieldText(entry.fields.get(key))
}

export interface CustomField {
	key: string
	value: string
	protected: boolean
}

/** `value` is an opaque handle into the database's binary pool. */
export interface Attachment {
	name: string
	value: KdbxBinary | KdbxBinaryWithHash
}

/**
 * Plain, editable copy of an entry. The UI edits drafts; only `applyDraft`
 * writes back, so every change goes through history handling.
 */
export interface EntryDraft {
	title: string
	username: string
	password: string
	url: string
	notes: string
	tags: string[]
	/** null = never expires */
	expires: Date | null
	customFields: CustomField[]
	attachments: Attachment[]
	/** KeePass standard icon index */
	icon: number
	/** UUID of a custom icon in the database; takes precedence over `icon` */
	customIcon: string | null
}

export function draftFromEntry(entry: KdbxEntry): EntryDraft {
	const customFields: CustomField[] = []
	for (const [key, value] of entry.fields) {
		if (!isStandardField(key)) {
			customFields.push({ key, value: fieldText(value), protected: value instanceof ProtectedValue })
		}
	}
	return {
		title: getField(entry, StandardField.Title),
		username: getField(entry, StandardField.UserName),
		password: getField(entry, StandardField.Password),
		url: getField(entry, StandardField.URL),
		notes: getField(entry, StandardField.Notes),
		tags: [...entry.tags],
		expires: entry.times.expires ? (entry.times.expiryTime ?? null) : null,
		customFields,
		attachments: [...entry.binaries].map(([name, value]) => ({ name, value })),
		icon: entry.icon ?? 0,
		customIcon: entry.customIcon?.id ?? null,
	}
}

export function emptyDraft(defaultUser = ''): EntryDraft {
	return {
		title: '',
		username: defaultUser,
		password: '',
		url: '',
		notes: '',
		tags: [],
		expires: null,
		customFields: [],
		attachments: [],
		icon: 0,
		customIcon: null,
	}
}

export function draftsEqual(a: EntryDraft, b: EntryDraft): boolean {
	return a.title === b.title
		&& a.username === b.username
		&& a.password === b.password
		&& a.url === b.url
		&& a.notes === b.notes
		&& a.icon === b.icon
		&& a.customIcon === b.customIcon
		&& a.tags.length === b.tags.length && a.tags.every((tag, i) => tag === b.tags[i])
		&& (a.expires?.getTime() ?? null) === (b.expires?.getTime() ?? null)
		&& a.customFields.length === b.customFields.length
		&& a.customFields.every((field, i) => {
			const other = b.customFields[i]!
			return field.key === other.key && field.value === other.value && field.protected === other.protected
		})
		&& a.attachments.length === b.attachments.length
		&& a.attachments.every((attachment, i) => {
			const other = b.attachments[i]!
			return attachment.name === other.name && sameBinary(attachment.value, other.value)
		})
}

function sameBinary(a: Attachment['value'], b: Attachment['value']): boolean {
	return a === b || ('hash' in a && 'hash' in b && a.hash === b.hash)
}

function protectionFor(db: Kdbx, key: string): boolean {
	const protection = db.meta.memoryProtection
	switch (key) {
		case StandardField.Title: return protection.title ?? false
		case StandardField.UserName: return protection.userName ?? false
		case StandardField.Password: return protection.password ?? true
		case StandardField.URL: return protection.url ?? false
		case StandardField.Notes: return protection.notes ?? false
		default: return false
	}
}

function makeField(value: string, isProtected: boolean): KdbxEntryField {
	return isProtected ? ProtectedValue.fromString(value) : value
}

function writeDraft(db: Kdbx, entry: KdbxEntry, draft: EntryDraft): void {
	const standard: [string, string][] = [
		[StandardField.Title, draft.title],
		[StandardField.UserName, draft.username],
		[StandardField.Password, draft.password],
		[StandardField.URL, draft.url],
		[StandardField.Notes, draft.notes],
	]
	for (const [key, value] of standard) {
		const current = entry.fields.get(key)
		const isProtected = current instanceof ProtectedValue || protectionFor(db, key)
		entry.fields.set(key, makeField(value, isProtected))
	}

	const keep = new Set(draft.customFields.map((field) => field.key))
	for (const key of [...entry.fields.keys()]) {
		if (!isStandardField(key) && !keep.has(key)) {
			entry.fields.delete(key)
		}
	}
	for (const field of draft.customFields) {
		if (field.key === '' || isStandardField(field.key)) {
			throw new Error(`Invalid custom field name "${field.key}"`)
		}
		entry.fields.set(field.key, makeField(field.value, field.protected))
	}

	for (const attachment of draft.attachments) {
		// A draft may hold attachments of a Kdbx instance that a sync has replaced since.
		if ('hash' in attachment.value && !db.binaries.getValueByHash(attachment.value.hash)) {
			db.binaries.addWithHash(attachment.value)
		}
	}
	entry.binaries = new Map(draft.attachments.map((attachment) => [attachment.name, attachment.value]))
	entry.icon = draft.icon
	entry.customIcon = draft.customIcon ? new KdbxUuid(draft.customIcon) : undefined

	entry.tags = [...new Set(draft.tags.map((tag) => tag.trim()).filter(Boolean))]
	entry.times.expires = draft.expires !== null
	if (draft.expires !== null) {
		entry.times.expiryTime = draft.expires
	}
}

/**
 * Writes `draft` into `entry`, keeping the previous state in the entry's history
 * (trimmed to the database's history limits). Returns false if nothing changed.
 */
export function applyDraft(db: Kdbx, entry: KdbxEntry, draft: EntryDraft): boolean {
	if (draftsEqual(draftFromEntry(entry), draft)) {
		return false
	}
	entry.pushHistory()
	writeDraft(db, entry, draft)
	entry.times.update()
	db.cleanup({ historyRules: true })
	return true
}

export function createEntry(db: Kdbx, group: KdbxGroup, draft: EntryDraft): KdbxEntry {
	const entry = db.createEntry(group)
	writeDraft(db, entry, draft)
	return entry
}

export function recycleBin(db: Kdbx): KdbxGroup | undefined {
	return db.meta.recycleBinEnabled && db.meta.recycleBinUuid
		? db.getGroup(db.meta.recycleBinUuid)
		: undefined
}

export function isInRecycleBin(db: Kdbx, item: KdbxEntry | KdbxGroup): boolean {
	const bin = recycleBin(db)
	if (!bin) {
		return false
	}
	for (let group = item.parentGroup; group; group = group.parentGroup) {
		if (group === bin) {
			return true
		}
	}
	return false
}

/**
 * Moves the entry to the recycle bin, or deletes it permanently when it is
 * already there or the database has no recycle bin (KeePassXC behaviour).
 */
export function deleteEntry(db: Kdbx, entry: KdbxEntry): 'recycled' | 'deleted' {
	if (db.meta.recycleBinEnabled && !isInRecycleBin(db, entry)) {
		db.remove(entry)
		return 'recycled'
	}
	db.move(entry, null)
	return 'deleted'
}

export function moveEntry(db: Kdbx, entry: KdbxEntry, group: KdbxGroup): void {
	db.move(entry, group)
}

/** Makes history state `index` current again; the replaced state goes to history first. */
export function restoreHistory(db: Kdbx, entry: KdbxEntry, index: number): void {
	const state = entry.history[index]
	if (!state) {
		throw new RangeError(`No history entry ${index}`)
	}
	entry.pushHistory()
	writeDraft(db, entry, draftFromEntry(state))
	entry.fgColor = state.fgColor
	entry.bgColor = state.bgColor
	entry.times.update()
	db.cleanup({ historyRules: true })
}

/** Adds a file to the draft; the binary is stored in the database pool right away and deduplicated by hash. */
export async function attachFile(db: Kdbx, draft: EntryDraft, name: string, data: Uint8Array): Promise<void> {
	const value = await db.createBinary(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer)
	const attachments = draft.attachments.filter((attachment) => attachment.name !== name)
	draft.attachments = [...attachments, { name, value }]
}

export function attachmentData(attachment: Attachment): Uint8Array {
	const value = 'hash' in attachment.value ? attachment.value.value : attachment.value
	return value instanceof ProtectedValue ? value.getBinary() : new Uint8Array(value)
}

export function deleteHistory(entry: KdbxEntry, index: number): void {
	entry.removeHistory(index, 1)
	entry.times.update()
}

export function isExpired(entry: KdbxEntry, now = new Date()): boolean {
	return Boolean(entry.times.expires && entry.times.expiryTime && entry.times.expiryTime <= now)
}

export function entryPath(entry: KdbxEntry | KdbxGroup): string[] {
	const path: string[] = []
	for (let group = entry.parentGroup; group; group = group.parentGroup) {
		path.unshift(group.name ?? '')
	}
	return path
}
