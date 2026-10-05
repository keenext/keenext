import type { Kdbx, KdbxGroup } from 'kdbxweb'
import { recycleBin } from './entries'

export function createGroup(db: Kdbx, parent: KdbxGroup, name: string): KdbxGroup {
	return db.createGroup(parent, name)
}

export function renameGroup(group: KdbxGroup, name: string, notes?: string): void {
	group.name = name
	if (notes !== undefined) {
		group.notes = notes
	}
	group.times.update()
}

export function isDescendant(group: KdbxGroup, ancestor: KdbxGroup): boolean {
	for (let current: KdbxGroup | undefined = group; current; current = current.parentGroup) {
		if (current === ancestor) {
			return true
		}
	}
	return false
}

export function moveGroup(db: Kdbx, group: KdbxGroup, target: KdbxGroup): void {
	if (isDescendant(target, group)) {
		throw new Error('A group cannot be moved into itself')
	}
	db.move(group, target)
}

/** Same rules as for entries: recycle first, delete permanently from inside the bin. */
export function deleteGroup(db: Kdbx, group: KdbxGroup): 'recycled' | 'deleted' {
	if (group === db.getDefaultGroup()) {
		throw new Error('The root group cannot be deleted')
	}
	const bin = recycleBin(db)
	if (group === bin) {
		throw new Error('The recycle bin cannot be deleted, empty it instead')
	}
	if (db.meta.recycleBinEnabled && !(bin && isDescendant(group, bin))) {
		db.remove(group)
		return 'recycled'
	}
	db.move(group, null)
	return 'deleted'
}

export function emptyRecycleBin(db: Kdbx): void {
	const bin = recycleBin(db)
	if (!bin) {
		return
	}
	for (const child of [...bin.groups, ...bin.entries]) {
		db.move(child, null)
	}
}

/** Whether entries of this group take part in search (KeePass "EnableSearching", inherited). */
export function isSearchable(db: Kdbx, group: KdbxGroup): boolean {
	const bin = recycleBin(db)
	for (let current: KdbxGroup | undefined = group; current; current = current.parentGroup) {
		if (current === bin) {
			return false
		}
		if (current.enableSearching === false) {
			return false
		}
		if (current.enableSearching === true) {
			return true
		}
	}
	return true
}
