import type { DatabaseStorage, StoredFile } from '@/core/session'

import { getCurrentUser } from '@nextcloud/auth'
import axios, { isAxiosError } from '@nextcloud/axios'
import { encodePath } from '@nextcloud/paths'
import { generateRemoteUrl } from '@nextcloud/router'
import { getFileInfo } from './api.ts'
import { ConflictError } from '@/core/session'

export class StorageError extends Error {
	constructor(readonly reason: 'locked' | 'forbidden' | 'not-found' | 'exists' | 'unknown', message: string, options?: { cause?: unknown }) {
		super(message, options)
		this.name = 'StorageError'
	}
}

function davUrl(path: string): string {
	const user = getCurrentUser()
	if (!user) {
		throw new Error('Not logged in')
	}
	return generateRemoteUrl(`dav/files/${encodeURIComponent(user.uid)}${encodePath(path)}`)
}

/** If-Match compares the quoted form; file info and OC-ETag come unquoted. */
export function quoteEtag(etag: string): string {
	return etag.startsWith('"') || etag.startsWith('W/') ? etag : `"${etag}"`
}

function etagFrom(headers: Record<string, unknown>): string | undefined {
	const value = headers.etag ?? headers['oc-etag']
	return typeof value === 'string' && value !== '' ? quoteEtag(value) : undefined
}

function storageError(error: unknown): unknown {
	if (!isAxiosError(error) || !error.response) {
		return error
	}
	switch (error.response.status) {
		case 403: return new StorageError('forbidden', 'You are not allowed to change this file', { cause: error })
		case 404: return new StorageError('not-found', 'The file no longer exists', { cause: error })
		case 423: return new StorageError('locked', 'The file is locked by another application', { cause: error })
		default: return error
	}
}

export async function downloadFile(path: string): Promise<StoredFile> {
	try {
		const response = await axios.get<ArrayBuffer>(davUrl(path), {
			responseType: 'arraybuffer',
			headers: { 'Cache-Control': 'no-cache' },
		})
		return { data: response.data, etag: etagFrom(response.headers) ?? '' }
	} catch (error) {
		throw storageError(error)
	}
}

export async function downloadFileById(fileId: number): Promise<Uint8Array> {
	const info = await getFileInfo(fileId)
	return new Uint8Array((await downloadFile(info.path)).data)
}

/** Nextcloud reports a written file's id as "<zero-padded id><instance id>". */
function fileIdFrom(headers: Record<string, unknown>): number | undefined {
	const value = headers['oc-fileid']
	const id = typeof value === 'string' ? Number.parseInt(value, 10) : Number.NaN
	return Number.isFinite(id) ? id : undefined
}

async function propfindFileId(path: string): Promise<number> {
	const response = await axios.request<string>({
		method: 'PROPFIND',
		url: davUrl(path),
		headers: { Depth: '0', 'Content-Type': 'application/xml' },
		data: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns"><d:prop><oc:fileid/></d:prop></d:propfind>',
		responseType: 'text',
	})
	const id = Number.parseInt(/<oc:fileid>(\d+)<\/oc:fileid>/.exec(response.data)?.[1] ?? '', 10)
	if (!Number.isFinite(id)) {
		throw new Error(`No file id for ${path}`)
	}
	return id
}

/** Creates a new file; fails with reason "exists" instead of overwriting. */
export async function createFile(path: string, data: ArrayBuffer): Promise<{ etag: string, fileId: number }> {
	try {
		const response = await axios.put(davUrl(path), data, {
			headers: { 'Content-Type': 'application/octet-stream', 'If-None-Match': '*' },
		})
		return {
			etag: etagFrom(response.headers) ?? '',
			fileId: fileIdFrom(response.headers) ?? await propfindFileId(path),
		}
	} catch (error) {
		if (isAxiosError(error) && error.response?.status === 412) {
			throw new StorageError('exists', 'A file with this name already exists', { cause: error })
		}
		throw storageError(error)
	}
}

/**
 * A database file addressed by its Nextcloud file id. The path is looked up
 * again before every read, so moving or renaming the file while it is open
 * does not break saving.
 */
export class NextcloudFileStorage implements DatabaseStorage {
	constructor(readonly fileId: number, private path: string) {}

	get currentPath(): string {
		return this.path
	}

	async read(): Promise<StoredFile> {
		this.path = (await getFileInfo(this.fileId)).path
		return downloadFile(this.path)
	}

	async write(data: ArrayBuffer, etag: string): Promise<{ etag: string }> {
		try {
			const response = await axios.put(davUrl(this.path), data, {
				headers: { 'Content-Type': 'application/octet-stream', 'If-Match': etag },
			})
			return { etag: etagFrom(response.headers) ?? quoteEtag((await getFileInfo(this.fileId)).etag) }
		} catch (error) {
			if (isAxiosError(error)) {
				// 412: changed meanwhile. 404: moved; the session re-reads, which resolves the new path.
				if (error.response?.status === 412 || error.response?.status === 404) {
					throw new ConflictError()
				}
			}
			throw storageError(error)
		}
	}
}
