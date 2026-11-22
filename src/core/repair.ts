import type { Kdbx } from 'kdbxweb'

import { KdbxEntry, KdbxGroup } from 'kdbxweb'

type Item = KdbxEntry | KdbxGroup

interface Occurrence {
	item: Item
	parent: KdbxGroup
}

/**
 * Makes every entry and group appear once. A file can hold the same UUID in two
 * groups (left behind by older kdbxweb merges), and kdbxweb refuses to merge it.
 * The copy that was moved last keeps its place; an entry there takes the content
 * changed last and keeps the other state in its history. The children of a
 * dropped group copy move into the one that stays.
 * Returns how many copies were dropped.
 */
export function removeDuplicates(db: Kdbx): number {
	let removed = 0
	for (let duplicate = findDuplicate(db); duplicate; duplicate = findDuplicate(db)) {
		const [first, second] = duplicate
		let [keep, drop] = second.item.locationChanged > first.item.locationChanged ? [second, first] : [first, second]
		// a group copy inside the other copy would be cut off with it
		if (isWithin(keep.parent, drop.item)) {
			[keep, drop] = [drop, keep]
		}
		detach(drop)
		keep.item.parentGroup = keep.parent
		if (keep.item !== drop.item) {
			if (keep.item instanceof KdbxEntry && drop.item instanceof KdbxEntry) {
				foldEntry(keep.item, drop.item)
			} else if (keep.item instanceof KdbxGroup && drop.item instanceof KdbxGroup) {
				foldGroup(keep.item, drop.item)
			}
		}
		removed++
	}
	return removed
}

function findDuplicate(db: Kdbx): [Occurrence, Occurrence] | undefined {
	const seen = new Map<string, Occurrence>()
	const visit = (parent: KdbxGroup): [Occurrence, Occurrence] | undefined => {
		for (const item of [...parent.entries, ...parent.groups]) {
			const occurrence = { item, parent }
			const earlier = seen.get(item.uuid.id)
			if (earlier) {
				return [earlier, occurrence]
			}
			seen.set(item.uuid.id, occurrence)
		}
		for (const group of parent.groups) {
			const found = visit(group)
			if (found) {
				return found
			}
		}
		return undefined
	}
	const root = db.getDefaultGroup()
	seen.set(root.uuid.id, { item: root, parent: root })
	return visit(root)
}

function isWithin(group: KdbxGroup, ancestor: Item): boolean {
	for (let current: KdbxGroup | undefined = group; current; current = current.parentGroup) {
		if (current === ancestor) {
			return true
		}
	}
	return false
}

function detach({ item, parent }: Occurrence): void {
	if (item instanceof KdbxEntry) {
		parent.entries.splice(parent.entries.indexOf(item), 1)
	} else {
		parent.groups.splice(parent.groups.indexOf(item), 1)
	}
}

function foldEntry(keep: KdbxEntry, drop: KdbxEntry): void {
	if (drop.lastModTime > keep.lastModTime) {
		const { locationChanged } = keep.times
		const { previousParentGroup, parentGroup } = keep
		keep.pushHistory()
		keep.copyFrom(drop)
		keep.times.locationChanged = locationChanged
		keep.previousParentGroup = previousParentGroup
		keep.parentGroup = parentGroup
	} else if (drop.lastModTime < keep.lastModTime && !keep.history.some((state) => state.lastModTime === drop.lastModTime)) {
		const state = new KdbxEntry()
		state.copyFrom(drop)
		keep.history.push(state)
		keep.history.sort((a, b) => a.lastModTime - b.lastModTime)
	}
}

function foldGroup(keep: KdbxGroup, drop: KdbxGroup): void {
	if (drop.lastModTime > keep.lastModTime) {
		const { locationChanged } = keep.times
		const { previousParentGroup } = keep
		keep.copyFrom(drop)
		keep.times.locationChanged = locationChanged
		keep.previousParentGroup = previousParentGroup
	}
	for (const entry of drop.entries) {
		entry.parentGroup = keep
		keep.entries.push(entry)
	}
	for (const group of drop.groups) {
		group.parentGroup = keep
		keep.groups.push(group)
	}
}
