import axios from '@nextcloud/axios'
import { generateOcsUrl } from '@nextcloud/router'

export interface FileInfo {
	fileId: number
	name: string
	/** Relative to the user's files root, starting with "/". */
	path: string
	size: number
	mtime: number
	etag: string
	writable: boolean
}

export interface RecentFile extends FileInfo {
	openedAt: number
	keyFile: { fileId: number, name: string, path: string } | null
}

export interface Settings {
	autosave: boolean
	lockAfterMinutes: number
	lockOnHide: boolean
	clipboardClearSeconds: number
	syncIntervalSeconds: number
	rememberKeyFile: boolean
}

export const DEFAULT_SETTINGS: Settings = {
	autosave: true,
	lockAfterMinutes: 15,
	lockOnHide: false,
	clipboardClearSeconds: 20,
	syncIntervalSeconds: 60,
	rememberKeyFile: true,
}

const ocsHeaders = { 'OCS-APIRequest': 'true', Accept: 'application/json' }

function url(path: string): string {
	return generateOcsUrl(`apps/keenext/api/v1/${path}`)
}

async function ocs<T>(request: Promise<{ data: { ocs: { data: T } } }>): Promise<T> {
	return (await request).data.ocs.data
}

export function getFileInfo(fileId: number): Promise<FileInfo> {
	return ocs(axios.get(url(`files/${fileId}`), { headers: ocsHeaders }))
}

export function getRecent(): Promise<RecentFile[]> {
	return ocs(axios.get(url('recent'), { headers: ocsHeaders }))
}

export function touchRecent(fileId: number, keyFileId: number | null): Promise<RecentFile[]> {
	return ocs(axios.post(url('recent'), { fileId, keyFileId }, { headers: ocsHeaders }))
}

export function removeRecent(fileId: number): Promise<RecentFile[]> {
	return ocs(axios.delete(url(`recent/${fileId}`), { headers: ocsHeaders }))
}

export function saveSettings(settings: Partial<Settings>): Promise<Settings> {
	return ocs(axios.put(url('settings'), { settings }, { headers: ocsHeaders }))
}
