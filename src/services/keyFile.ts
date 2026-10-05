import { downloadFileById } from './webdav.ts'

/**
 * A key file is either a Nextcloud file (loaded on unlock, remembered by id)
 * or a local file whose content is read right away and never uploaded.
 */
export interface KeyFileChoice {
	name: string
	fileId?: number
	path?: string
	data?: Uint8Array
}

/** Loads the key file content; Nextcloud key files are fetched only now, at unlock time. */
export async function resolveKeyFile(choice: KeyFileChoice | null): Promise<{ keyFile?: Uint8Array, keyFileId?: number }> {
	if (!choice) {
		return {}
	}
	if (choice.data) {
		return { keyFile: choice.data }
	}
	if (choice.fileId !== undefined) {
		return { keyFile: await downloadFileById(choice.fileId), keyFileId: choice.fileId }
	}
	return {}
}
