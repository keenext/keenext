<template>
	<NcAppNavigationItem
		:name="group.name || t('keepassweb', 'Unnamed group')"
		:active="database.selectedGroup === group.uuid.id && !database.query"
		:allowCollapse="state.children.length > 0"
		:open="expanded"
		@update:open="toggle"
		@click="select">
		<template #icon>
			<img
				v-if="state.customIcon"
				:src="state.customIcon"
				alt=""
				class="group-item__custom-icon">
			<NcIconSvgWrapper v-else :path="state.isBin ? mdiTrashCanOutline : standardIconPath(group.icon)" />
		</template>
		<template v-if="state.entryCount > 0" #counter>
			<NcCounterBubble :count="state.entryCount" />
		</template>
		<template v-if="database.writable" #actions>
			<NcActionButton v-if="!state.isBin" closeAfterClick @click="dialog = 'create'">
				<template #icon>
					<NcIconSvgWrapper :path="mdiFolderPlus" />
				</template>
				{{ t('keepassweb', 'New subgroup') }}
			</NcActionButton>
			<NcActionButton v-if="!state.isBin" closeAfterClick @click="dialog = 'edit'">
				<template #icon>
					<NcIconSvgWrapper :path="mdiPencil" />
				</template>
				{{ t('keepassweb', 'Edit group') }}
			</NcActionButton>
			<NcActionButton v-if="state.isBin" closeAfterClick @click="emptyBin">
				<template #icon>
					<NcIconSvgWrapper :path="mdiDeleteEmpty" />
				</template>
				{{ t('keepassweb', 'Empty recycle bin') }}
			</NcActionButton>
			<NcActionButton v-if="!state.isRoot && !state.isBin" closeAfterClick @click="remove">
				<template #icon>
					<NcIconSvgWrapper :path="mdiDelete" />
				</template>
				{{ t('keepassweb', 'Delete group') }}
			</NcActionButton>
		</template>

		<GroupTreeItem
			v-for="child in state.children"
			:key="child.uuid.id"
			:database="database"
			:group="child" />

		<GroupDialog
			v-if="dialog"
			:name="dialog === 'edit' ? group.name ?? '' : ''"
			:notes="dialog === 'edit' ? group.notes ?? '' : ''"
			:title="dialog === 'edit' ? t('keepassweb', 'Edit group') : t('keepassweb', 'New subgroup')"
			@submit="submitDialog"
			@close="dialog = null" />
	</NcAppNavigationItem>
</template>

<script setup lang="ts">
import type { KdbxGroup } from 'kdbxweb'
import type { OpenDatabase } from '@/stores/vault'

import { mdiDelete, mdiDeleteEmpty, mdiFolderPlus, mdiPencil, mdiTrashCanOutline } from '@mdi/js'
import { showConfirmation } from '@nextcloud/dialogs'
import { computed, ref } from 'vue'
import NcActionButton from '@nextcloud/vue/components/NcActionButton'
import NcAppNavigationItem from '@nextcloud/vue/components/NcAppNavigationItem'
import NcCounterBubble from '@nextcloud/vue/components/NcCounterBubble'
import NcIconSvgWrapper from '@nextcloud/vue/components/NcIconSvgWrapper'
import GroupDialog from './GroupDialog.vue'
import { recycleBin } from '@/core/entries'
import { createGroup, deleteGroup, emptyRecycleBin, renameGroup, setExpanded } from '@/core/groups'
import { t } from '@/l10n'
import { customIconUrl, standardIconPath } from '@/services/icons'
import { useVaultStore } from '@/stores/vault'

defineOptions({ name: 'GroupTreeItem' })

const props = defineProps<{
	database: OpenDatabase
	group: KdbxGroup
}>()

const vault = useVaultStore()
const dialog = ref<'create' | 'edit' | null>(null)

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
		customIcon: customIconUrl(db, props.group),
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

function submitDialog(values: { name: string, notes: string }): void {
	if (dialog.value === 'create') {
		const created = vault.change(props.database.id, (db) => {
			const group = createGroup(db, props.group, values.name)
			group.notes = values.notes || undefined
			return group
		})
		toggle(true)
		vault.select(props.database.id, { group: created.uuid.id, entry: null })
	} else {
		vault.change(props.database.id, () => renameGroup(props.group, values.name, values.notes))
	}
	dialog.value = null
}

async function remove(): Promise<void> {
	const confirmed = await showConfirmation({
		name: t('keepassweb', 'Delete group'),
		text: t('keepassweb', 'Delete the group "{name}" with all its entries and subgroups?', { name: props.group.name ?? '' }),
		labelConfirm: t('keepassweb', 'Delete'),
		labelReject: t('keepassweb', 'Cancel'),
		severity: 'warning',
	})
	if (!confirmed) {
		return
	}
	if (props.database.selectedGroup === props.group.uuid.id) {
		vault.select(props.database.id, { group: props.group.parentGroup?.uuid.id ?? null })
	}
	vault.change(props.database.id, (db) => deleteGroup(db, props.group))
}

async function emptyBin(): Promise<void> {
	const confirmed = await showConfirmation({
		name: t('keepassweb', 'Empty recycle bin'),
		text: t('keepassweb', 'Permanently delete everything in the recycle bin?'),
		labelConfirm: t('keepassweb', 'Delete permanently'),
		labelReject: t('keepassweb', 'Cancel'),
		severity: 'warning',
	})
	if (confirmed) {
		vault.change(props.database.id, (db) => emptyRecycleBin(db))
	}
}
</script>

<style scoped>
.group-item__custom-icon {
	width: 16px;
	height: 16px;
}
</style>
