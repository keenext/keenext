import {
	BinaryStream,
	Consts,
	Int64,
	Kdbx,
	KdbxContext,
	KdbxCredentials,
	KdbxError,
	KdbxHeader,
	KdbxUuid,
	ProtectedValue,
	VarDictionary,
} from 'kdbxweb'

export interface CredentialsInput {
	password?: string
	keyFile?: Uint8Array
}

export type OpenErrorReason = 'invalid-key' | 'corrupt' | 'unsupported' | 'costly-kdf' | 'unknown'

export class DatabaseOpenError extends Error {
	constructor(readonly reason: OpenErrorReason, message: string, options?: { cause?: unknown }) {
		super(message, options)
		this.name = 'DatabaseOpenError'
	}
}

/** The file's key derivation exceeds the limits; `kdf` describes it for a confirmation. */
export class CostlyKdfError extends DatabaseOpenError {
	constructor(readonly kdf: Kdf) {
		super('costly-kdf', 'The key derivation of this database is unusually expensive')
	}
}

/**
 * Upper bounds for the key derivation a file may ask for before it is opened. The
 * derivation runs before the key can be checked, so anyone who can write the file can
 * otherwise make unlocking (or a background sync) run for hours.
 */
export interface KdfLimits {
	aesRounds: number
	/** Argon2 memory in bytes times iterations */
	argon2Work: number
}

/** About half a minute to a minute in a desktop browser; KeePassXC's defaults stay far below. */
export const DEFAULT_KDF_LIMITS: KdfLimits = {
	aesRounds: 1_000_000_000,
	argon2Work: 32 * 1024 ** 3,
}

export function exceedsKdfLimits(kdf: Kdf, limits: KdfLimits): boolean {
	return kdf.type === 'aes'
		? kdf.rounds > limits.aesRounds
		: kdf.memory * kdf.iterations > limits.argon2Work
}

/** `limits`, raised as far as needed to allow `kdf`. */
export function kdfLimitsAllowing(kdf: Kdf, limits: KdfLimits = DEFAULT_KDF_LIMITS): KdfLimits {
	return kdf.type === 'aes'
		? { ...limits, aesRounds: Math.max(limits.aesRounds, kdf.rounds) }
		: { ...limits, argon2Work: Math.max(limits.argon2Work, kdf.memory * kdf.iterations) }
}

/** The key derivation a file asks for, read from its header; undefined if the header does not parse. */
export function readKdf(data: ArrayBuffer | Uint8Array): Kdf | undefined {
	try {
		const header = KdbxHeader.read(new BinaryStream(toArrayBuffer(data)), new KdbxContext({ kdbx: new Kdbx() }))
		return kdfOf(header)
	} catch {
		return undefined
	}
}

export interface OpenOptions {
	/** Aborting stops the key derivation; the promise then rejects with the signal's reason. */
	signal?: AbortSignal
	kdfLimits?: KdfLimits
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

/** Throws CostlyKdfError, without deriving anything, if the file's key derivation exceeds the limits. */
export async function openDatabase(
	data: ArrayBuffer | Uint8Array,
	credentials: KdbxCredentials,
	{ signal, kdfLimits = DEFAULT_KDF_LIMITS }: OpenOptions = {},
): Promise<Kdbx> {
	const kdf = readKdf(data)
	if (kdf && exceedsKdfLimits(kdf, kdfLimits)) {
		throw new CostlyKdfError(kdf)
	}
	await credentials.ready
	try {
		return await Kdbx.load(toArrayBuffer(data), credentials, { signal })
	} catch (error) {
		if (signal?.aborted) {
			throw error
		}
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

/** 64 MiB as in KeePassXC; unlocking or saving takes about half a second in the browser (WebAssembly). */
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

export type Kdf = KdfSettings | { type: 'aes', rounds: number }

export function getKdf(db: Kdbx): Kdf {
	return kdfOf(db.header)
}

/** Format, cipher, compression and key derivation as a comparable value; salts and seeds, which change on every save, are left out. */
export function encryptionSettings(header: KdbxHeader): string {
	return JSON.stringify([header.versionMajor, header.versionMinor, header.dataCipherUuid?.id, header.compression, kdfOf(header)])
}

function kdfOf(header: KdbxHeader): Kdf {
	const params = header.kdfParameters
	if (!params) {
		return { type: 'aes', rounds: header.keyEncryptionRounds ?? 0 }
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

/** Exact up to 2^53; larger values (only seen in crafted files) come out approximate. */
function int64ToNumber(value: unknown): number {
	if (value instanceof Int64) {
		return value.hi * 2 ** 32 + value.lo
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

export type Cipher = 'aes' | 'chacha20' | 'twofish'

const cipherIds: Record<Cipher, string> = {
	aes: Consts.CipherId.Aes,
	chacha20: Consts.CipherId.ChaCha20,
	twofish: Consts.CipherId.Twofish,
}

function cipherOf(db: Kdbx): Cipher {
	const id = db.header.dataCipherUuid?.id
	return (Object.keys(cipherIds) as Cipher[]).find((cipher) => cipherIds[cipher] === id) ?? 'aes'
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
	cipher: Cipher
	kdf: Kdf
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
		cipher: cipherOf(db),
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
	const encryption = encryptionSettings(db.header)
	if (settings.cipher !== current.cipher) {
		db.header.dataCipherUuid = new KdbxUuid(cipherIds[settings.cipher])
	}
	if (JSON.stringify(settings.kdf) !== JSON.stringify(current.kdf) && settings.kdf.type !== 'aes') {
		if (db.versionMajor < 4) {
			db.upgrade()
		}
		setKdf(db, settings.kdf)
	}
	// Decides which side's encryption settings win when both changed them (DatabaseSession).
	if (encryptionSettings(db.header) !== encryption) {
		db.meta.settingsChanged = new Date()
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
