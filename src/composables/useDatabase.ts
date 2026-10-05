import type { Kdbx, KdbxEntry, KdbxGroup } from 'kdbxweb'
import { computed, type ComputedRef, type MaybeRefOrGetter, toValue } from 'vue'
import type { OpenDatabase } from '@/stores/vault'

export interface DatabaseView {
	db: Kdbx
	/** Changes on every mutation; reading it makes a computed depend on the database contents. */
	revision: number
}

/**
 * kdbxweb objects are not reactive. Views read the database through this
 * snapshot, which is a new object per revision, so dependent computeds rerun
 * whenever the store records a change.
 */
export function useDatabaseView(database: MaybeRefOrGetter<OpenDatabase>): ComputedRef<DatabaseView | null> {
	return computed(() => {
		const record = toValue(database)
		const revision = record.revision
		return record.session ? { db: record.session.db, revision } : null
	})
}

/** Lookup by UUID; selections are stored as UUIDs because a sync may replace the Kdbx instance. */
export function findEntry(db: Kdbx, uuid: string | null): KdbxEntry | undefined {
	if (!uuid) {
		return undefined
	}
	for (const entry of db.getDefaultGroup().allEntries()) {
		if (entry.uuid.id === uuid) {
			return entry
		}
	}
	return undefined
}

export function findGroup(db: Kdbx, uuid: string | null): KdbxGroup | undefined {
	return uuid ? db.getGroup(uuid) : undefined
}
