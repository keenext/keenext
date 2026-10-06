/**
 * Drag payloads between the entry list and the group tree. The database id is
 * part of the payload so drops into another open database are ignored.
 */
export const ENTRY_TYPE = 'application/x-keenext-entry'
export const GROUP_TYPE = 'application/x-keenext-group'

export interface DragPayload {
	database: string
	uuid: string
}

export function startDrag(event: DragEvent, type: typeof ENTRY_TYPE | typeof GROUP_TYPE, payload: DragPayload): void {
	if (!event.dataTransfer) {
		return
	}
	event.dataTransfer.setData(type, JSON.stringify(payload))
	event.dataTransfer.effectAllowed = 'move'
}

/** Drag data is only readable on drop; during dragover only the types are known. */
export function draggedType(event: DragEvent): typeof ENTRY_TYPE | typeof GROUP_TYPE | undefined {
	const types = event.dataTransfer?.types ?? []
	if (types.includes(ENTRY_TYPE)) {
		return ENTRY_TYPE
	}
	return types.includes(GROUP_TYPE) ? GROUP_TYPE : undefined
}

export function readDrop(event: DragEvent, type: typeof ENTRY_TYPE | typeof GROUP_TYPE): DragPayload | undefined {
	try {
		const payload = JSON.parse(event.dataTransfer?.getData(type) ?? '')
		return typeof payload?.database === 'string' && typeof payload?.uuid === 'string' ? payload : undefined
	} catch {
		return undefined
	}
}
