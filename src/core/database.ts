import {
	Consts,
	Int64,
	Kdbx,
	KdbxCredentials,
	KdbxError,
	KdbxUuid,
	ProtectedValue,
	VarDictionary,
} from 'kdbxweb'

export interface CredentialsInput {
	password?: string
	keyFile?: Uint8Array
}

export type OpenErrorReason = 'invalid-key' | 'corrupt' | 'unsupported' | 'unknown'

export class DatabaseOpenError extends Error {
	constructor(readonly reason: OpenErrorReason, message: string, options?: { cause?: unknown }) {
		super(message, options)
		this.name = 'DatabaseOpenError'
	}
}

export function createCredentials({ password, keyFile }: CredentialsInput): KdbxCredentials {
	return new KdbxCredentials(
		password !== undefined ? ProtectedValue.fromString(password) : null,
		keyFile ?? null,
	)
}

export function toArrayBuffer(data: ArrayBuffer | Uint8Array): ArrayBuffer {
	if (data instanceof ArrayBuffer) {
		return data
	}
	return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
}

export async function openDatabase(data: ArrayBuffer | Uint8Array, credentials: KdbxCredentials): Promise<Kdbx> {
	await credentials.ready
	try {
		return await Kdbx.load(toArrayBuffer(data), credentials)
	} catch (error) {
		throw classifyOpenError(error)
	}
}

function classifyOpenError(error: unknown): DatabaseOpenError {
	if (error instanceof KdbxError) {
		switch (error.code) {
			case Consts.ErrorCodes.InvalidKey:
				return new DatabaseOpenError('invalid-key', 'Wrong password or key file', { cause: error })
			case Consts.ErrorCodes.BadSignature:
			case Consts.ErrorCodes.FileCorrupt:
				return new DatabaseOpenError('corrupt', `Not a valid KeePass database: ${error.message}`, { cause: error })
			case Consts.ErrorCodes.InvalidVersion:
			case Consts.ErrorCodes.Unsupported:
				return new DatabaseOpenError('unsupported', `Unsupported database format: ${error.message}`, { cause: error })
		}
	}
	const message = error instanceof Error ? error.message : String(error)
	return new DatabaseOpenError('unknown', message, { cause: error })
}

export async function saveDatabase(db: Kdbx): Promise<ArrayBuffer> {
	return db.save()
}

export interface KdfSettings {
	type: 'argon2id' | 'argon2d'
	/** bytes */
	memory: number
	iterations: number
	parallelism: number
}

/** 64 MiB, matching KeePassXC's default; iterations sized for ~1 s with WebAssembly. */
export const DEFAULT_KDF: KdfSettings = {
	type: 'argon2id',
	memory: 64 * 1024 * 1024,
	iterations: 4,
	parallelism: 2,
}

export function setKdf(db: Kdbx, settings: KdfSettings): void {
	db.setKdf(settings.type === 'argon2id' ? Consts.KdfId.Argon2id : Consts.KdfId.Argon2d)
	const params = db.header.kdfParameters
	if (!params) {
		throw new Error('KDF parameters are only available in KDBX 4')
	}
	params.set('M', VarDictionary.ValueType.UInt64, Int64.from(settings.memory))
	params.set('I', VarDictionary.ValueType.UInt64, Int64.from(settings.iterations))
	params.set('P', VarDictionary.ValueType.UInt32, settings.parallelism)
}

export function getKdf(db: Kdbx): KdfSettings | { type: 'aes', rounds: number } {
	const params = db.header.kdfParameters
	if (!params) {
		return { type: 'aes', rounds: db.header.keyEncryptionRounds ?? 0 }
	}
	const uuid = params.get('$UUID')
	const id = uuid instanceof ArrayBuffer ? bytesToBase64(new Uint8Array(uuid)) : ''
	if (id === Consts.KdfId.Aes) {
		return { type: 'aes', rounds: int64ToNumber(params.get('R')) }
	}
	return {
		type: id === Consts.KdfId.Argon2id ? 'argon2id' : 'argon2d',
		memory: int64ToNumber(params.get('M')),
		iterations: int64ToNumber(params.get('I')),
		parallelism: Number(params.get('P') ?? 1),
	}
}

function int64ToNumber(value: unknown): number {
	if (value instanceof Int64) {
		return value.value
	}
	return typeof value === 'number' ? value : 0
}

function bytesToBase64(bytes: Uint8Array): string {
	let binary = ''
	for (const byte of bytes) {
		binary += String.fromCharCode(byte)
	}
	return btoa(binary)
}

export function createDatabase(name: string, credentials: KdbxCredentials, kdf: KdfSettings = DEFAULT_KDF): Kdbx {
	const db = Kdbx.create(credentials, name)
	setKdf(db, kdf)
	db.header.dataCipherUuid = new KdbxUuid(Consts.CipherId.ChaCha20)
	db.getDefaultGroup().name = name
	return db
}

export interface DatabaseSettings {
	name: string
	description: string
	defaultUser: string
	recycleBinEnabled: boolean
	/** -1 = unlimited */
	historyMaxItems: number
	/** bytes, -1 = unlimited */
	historyMaxSize: number
	cipher: 'aes' | 'chacha20'
	kdf: KdfSettings | { type: 'aes', rounds: number }
	version: string
}

export function getDatabaseSettings(db: Kdbx): DatabaseSettings {
	return {
		name: db.meta.name ?? '',
		description: db.meta.desc ?? '',
		defaultUser: db.meta.defaultUser ?? '',
		recycleBinEnabled: db.meta.recycleBinEnabled ?? true,
		historyMaxItems: db.meta.historyMaxItems ?? 10,
		historyMaxSize: db.meta.historyMaxSize ?? 6 * 1024 * 1024,
		cipher: db.header.dataCipherUuid?.id === Consts.CipherId.ChaCha20 ? 'chacha20' : 'aes',
		kdf: getKdf(db),
		version: `${db.versionMajor}.${db.versionMinor}`,
	}
}

/**
 * Applies changed settings. Switching to an Argon2 KDF upgrades KDBX 3.1 files
 * to KDBX 4, which older clients (KeePass < 2.35) cannot open.
 */
export function applyDatabaseSettings(db: Kdbx, settings: DatabaseSettings): void {
	const current = getDatabaseSettings(db)
	// Only touch changed values: kdbxweb stamps every assignment with a change date used when merging.
	if (settings.name !== current.name) {
		db.meta.name = settings.name
	}
	if (settings.description !== current.description) {
		db.meta.desc = settings.description
	}
	if (settings.defaultUser !== current.defaultUser) {
		db.meta.defaultUser = settings.defaultUser
	}
	if (settings.recycleBinEnabled !== current.recycleBinEnabled) {
		db.meta.recycleBinEnabled = settings.recycleBinEnabled
	}
	if (settings.historyMaxItems !== current.historyMaxItems) {
		db.meta.historyMaxItems = settings.historyMaxItems
	}
	if (settings.historyMaxSize !== current.historyMaxSize) {
		db.meta.historyMaxSize = settings.historyMaxSize
	}
	if (settings.cipher !== current.cipher) {
		db.header.dataCipherUuid = new KdbxUuid(settings.cipher === 'chacha20' ? Consts.CipherId.ChaCha20 : Consts.CipherId.Aes)
	}
	if (JSON.stringify(settings.kdf) !== JSON.stringify(current.kdf) && settings.kdf.type !== 'aes') {
		if (db.versionMajor < 4) {
			db.upgrade()
		}
		setKdf(db, settings.kdf)
	}
	db.cleanup({ historyRules: true })
}

/** Builds credentials for a new master key; at least one component is required. */
export async function prepareCredentials(input: CredentialsInput): Promise<KdbxCredentials> {
	if (input.password === undefined && input.keyFile === undefined) {
		throw new Error('A password or a key file is required')
	}
	const credentials = createCredentials(input)
	await credentials.ready
	return credentials
}

/** Replaces the master key. The stored file keeps the old key until the next save. */
export function setCredentials(db: Kdbx, credentials: KdbxCredentials): void {
	db.credentials = credentials
	db.meta.keyChanged = new Date()
}
