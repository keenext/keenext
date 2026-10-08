import type { Kdbx } from 'kdbxweb'

import { KdbxUuid } from 'kdbxweb'

/** KeePass shows custom icons at 16–48 px; KeePassXC stores favicons scaled to at most this. */
export const FAVICON_MAX_SIZE = 128

export interface IconBytes {
	id: string
	data: Uint8Array
}

/** Size that fits inside max × max, keeping the aspect ratio and never enlarging. */
export function fitSize(width: number, height: number, max = FAVICON_MAX_SIZE): { width: number, height: number } {
	const scale = Math.min(1, max / Math.max(width, height))
	return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
	return a.byteLength === b.byteLength && a.every((byte, index) => byte === b[index])
}

/** The icon for these image bytes: an identical one the database already has, else a new, not yet stored one. */
export function iconFor(db: Kdbx, data: Uint8Array): IconBytes {
	for (const [id, icon] of db.meta.customIcons) {
		if (sameBytes(new Uint8Array(icon.data), data)) {
			return { id, data }
		}
	}
	return { id: KdbxUuid.random().id, data }
}

/** Stores the icon in the database unless it is already there. */
export function storeIcon(db: Kdbx, icon: IconBytes): void {
	if (!db.meta.customIcons.has(icon.id)) {
		db.meta.customIcons.set(icon.id, { data: icon.data.slice().buffer, lastModified: new Date() })
	}
}
