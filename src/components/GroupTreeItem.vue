<template>
	<NcAppNavigationItem
		:name="group.name || t('keenext', 'Unnamed group')"
		:active="database.selectedGroup === group.uuid.id && !database.query"
		:allowCollapse="state.children.length > 0"
		:open="expanded"
		:draggable="database.writable && !state.isRoot && !state.isBin"
		:class="{ 'group-item--drop-target': dropTarget }"
		@update:open="toggle"
		@click="select"
		@dragstart="onDragStart"
		@dragover="onDragOver"
		@dragleave="dropTarget = false"
		@drop="onDrop">
		<template #icon>
			<NcIconSvgWrapper v-if="state.isBin" :path="mdiTrashCanOutline" />
			<EntryIcon
				v-else
				:db="database.session!.db"
				:icon="group.icon"
				:customIcon="group.customIcon?.id ?? null"
				:size="20"
				:fallback="mdiFolder" />
		</template>
		<template v-if="state.entryCount > 0" #counter>
			<NcCounterBubble :count="state.entryCount" />
		</template>
		<template v-if="database.writable" #actions>
			<NcActionButton v-if="!state.isBin" closeAfterClick @click="dialog = 'create'">
				<template #icon>
					<NcIconSvgWrapper :path="mdiFolderPlus" />
				</template>
				{{ t('keenext', 'New subgroup') }}
			</NcActionButton>
			<NcActionButton v-if="!state.isBin" closeAfterClick @click="dialog = 'edit'">
				<template #icon>
					<NcIconSvgWrapper :path="mdiPencil" />
				</template>
				{{ t('keenext', 'Edit group') }}
			</NcActionButton>
			<NcActionButton v-if="!state.isRoot && !state.isBin" closeAfterClick @click="moving = true">
				<template #icon>
					<NcIconSvgWrapper :path="mdiFolderMove" />
				</template>
				{{ t('keenext', 'Move group') }}
			</NcActionButton>
			<NcActionButton v-if="state.isBin" closeAfterClick @click="emptyBin">
				<template #icon>
					<NcIconSvgWrapper :path="mdiDeleteEmpty" />
				</template>
				{{ t('keenext', 'Empty recycle bin') }}
			</NcActionButton>
			<NcActionButton v-if="!state.isRoot && !state.isBin" closeAfterClick @click="remove">
				<template #icon>
					<NcIconSvgWrapper :path="mdiDelete" />
				</template>
				{{ t('keenext', 'Delete group') }}
			</NcActionButton>
		</template>

		<GroupTreeItem
			v-for="child in state.children"
			:key="child.uuid.id"
			:database="database"
			:group="child" />

		<GroupDialog
			v-if="dialog"
			:database="database"
			:initial="dialog === 'edit' ? draftFromGroup(group) : { name: '', notes: '', icon: 48, customIcon: null }"
			:title="dialog === 'edit' ? t('keenext', 'Edit group') : t('keenext', 'New subgroup')"
			@submit="submitDialog"
			@close="dialog = null" />
		<MoveDialog
			v-if="moving"
			:database="database"
			:currentGroup="group.parentGroup?.uuid.id ?? null"
			:exclude="group.uuid.id"
			@move="move"
			@close="moving = false" />
	</NcAppNavigationItem>
</template>

<script setup lang="ts">
import type { KdbxGroup } from 'kdbxweb'
import type { GroupDraft } from '@/core/groups'
import type { OpenDatabase } from '@/stores/vault'

import { mdiDelete, mdiDeleteEmpty, mdiFolder, mdiFolderMove, mdiFolderPlus, mdiPencil, mdiTrashCanOutline } from '@mdi/js'
import { showConfirmation } from '@nextcloud/dialogs'
import { computed, ref } from 'vue'
import NcActionButton from '@nextcloud/vue/components/NcActionButton'
import NcAppNavigationItem from '@nextcloud/vue/components/NcAppNavigationItem'
import NcCounterBubble from '@nextcloud/vue/components/NcCounterBubble'
import NcIconSvgWrapper from '@nextcloud/vue/components/NcIconSvgWrapper'
import EntryIcon from './EntryIcon.vue'
import GroupDialog from './GroupDialog.vue'
import MoveDialog from './MoveDialog.vue'
import { findEntry, findGroup } from '@/composables/useDatabase'
import { draggedType, ENTRY_TYPE, GROUP_TYPE, readDrop, startDrag } from '@/composables/useDragAndDrop'
import { moveEntry, recycleBin } from '@/core/entries'
import { createGroup, deleteGroup, draftFromGroup, emptyRecycleBin, isDescendant, moveGroup, setExpanded, updateGroup } from '@/core/groups'
import { t } from '@/l10n'
import { useVaultStore } from '@/stores/vault'

defineOptions({ name: 'GroupTreeItem' })

const props = defineProps<{
	database: OpenDatabase
	group: KdbxGroup
}>()

const vault = useVaultStore()
const dialog = ref<'create' | 'edit' | null>(null)
const moving = ref(false)
const dropTarget = ref(false)

/** Snapshot of the group's state; recomputed on every database revision. */
const state = computed(() => {
	void props.database.revision
	const db = props.database.session!.db
	const bin = recycleBin(db)
	return {
		children: [...props.group.groups],
		entryCount: props.group.entries.length,
		isRoot: props.group === db.getDefaultGroup(),
		isBin: props.group === bin,
	}
})

// Local state: KeePass stores "expanded" in the file, but toggling it is not an edit worth saving on its own.
const expanded = ref(props.group.expanded ?? true)

function select(): void {
	vault.select(props.database.id, { group: props.group.uuid.id, entry: null })
}

function toggle(open: boolean): void {
	expanded.value = open
	setExpanded(props.group, open)
}

function submitDialog(values: GroupDraft): void {
	const id = props.group.uuid.id
	if (dialog.value === 'create') {
		const created = vault.change(props.database.id, (db) => {
			const group = createGroup(db, findGroup(db, id) ?? db.getDefaultGroup(), values.name)
			updateGroup(group, values)
			return group
		})
		toggle(true)
		vault.select(props.database.id, { group: created.uuid.id, entry: null })
	} else {
		vault.change(props.database.id, (db) => {
			const group = findGroup(db, id)
			if (group) {
				updateGroup(group, values)
			}
		})
	}
	dialog.value = null
}

// The navigation item's root element also wraps the child groups, so drag events
// bubble to every ancestor; the innermost group handles them and stops propagation.
function onDragStart(event: DragEvent): void {
	event.stopPropagation()
	startDrag(event, GROUP_TYPE, { database: props.database.id, uuid: props.group.uuid.id })
}

function canDrop(event: DragEvent): boolean {
	return props.database.writable && draggedType(event) !== undefined
}

function onDragOver(event: DragEvent): void {
	if (!canDrop(event)) {
		return
	}
	event.preventDefault()
	event.stopPropagation()
	event.dataTransfer!.dropEffect = 'move'
	dropTarget.value = true
}

function onDrop(event: DragEvent): void {
	dropTarget.value = false
	const type = draggedType(event)
	if (!type || !canDrop(event)) {
		return
	}
	event.preventDefault()
	event.stopPropagation()
	const payload = readDrop(event, type)
	if (!payload || payload.database !== props.database.id) {
		return
	}
	const targetId = props.group.uuid.id
	vault.change(props.database.id, (db) => {
		const target = findGroup(db, targetId)
		if (!target) {
			return
		}
		if (type === ENTRY_TYPE) {
			const entry = findEntry(db, payload.uuid)
			if (entry && entry.parentGroup !== target) {
				moveEntry(db, entry, target)
			}
			return
		}
		const group = findGroup(db, payload.uuid)
		if (group && group !== target && group.parentGroup !== target && !isDescendant(target, group)) {
			moveGroup(db, group, target)
		}
	})
}

function move(targetId: string): void {
	const id = props.group.uuid.id
	vault.change(props.database.id, (db) => {
		const group = findGroup(db, id)
		const target = findGroup(db, targetId)
		if (group && target) {
			moveGroup(db, group, target)
		}
	})
	moving.value = false
}

async function remove(): Promise<void> {
	const confirmed = await showConfirmation({
		name: t('keenext', 'Delete group'),
		text: t('keenext', 'Delete the group "{name}" with all its entries and subgroups?', { name: props.group.name ?? '' }),
		labelConfirm: t('keenext', 'Delete'),
		labelReject: t('keenext', 'Cancel'),
		severity: 'warning',
	})
	if (!confirmed) {
		return
	}
	const id = props.group.uuid.id
	if (props.database.selectedGroup === id) {
		vault.select(props.database.id, { group: props.group.parentGroup?.uuid.id ?? null })
	}
	vault.change(props.database.id, (db) => {
		const group = findGroup(db, id)
		if (group) {
			deleteGroup(db, group)
		}
	})
}

async function emptyBin(): Promise<void> {
	const confirmed = await showConfirmation({
		name: t('keenext', 'Empty recycle bin'),
		text: t('keenext', 'Permanently delete everything in the recycle bin?'),
		labelConfirm: t('keenext', 'Delete permanently'),
		labelReject: t('keenext', 'Cancel'),
		severity: 'warning',
	})
	if (confirmed) {
		vault.change(props.database.id, (db) => emptyRecycleBin(db))
	}
}
</script>

<style scoped>
.group-item--drop-target > :deep(.app-navigation-entry) {
	outline: 2px dashed var(--color-primary-element);
	outline-offset: -2px;
}
</style>
