<template>
	<NcDialog
		:name="t('keepassweb', 'Move to group')"
		:buttons="buttons"
		@update:open="(open) => open || emit('close')">
		<NcSelect
			v-model="selected"
			:options="options"
			:inputLabel="t('keepassweb', 'Group')"
			:clearable="false"
			label="label" />
	</NcDialog>
</template>

<script setup lang="ts">
import type { KdbxGroup } from 'kdbxweb'
import type { OpenDatabase } from '@/stores/vault'

import { computed, shallowRef } from 'vue'
import NcDialog from '@nextcloud/vue/components/NcDialog'
import NcSelect from '@nextcloud/vue/components/NcSelect'
import { useDatabaseView } from '@/composables/useDatabase'
import { isInRecycleBin, recycleBin } from '@/core/entries'
import { t } from '@/l10n'

const props = defineProps<{
	database: OpenDatabase
	currentGroup: string | null
	/** Group whose subtree is not offered as a target (when moving that group). */
	exclude?: string
}>()

const emit = defineEmits<{
	move: [groupId: string]
	close: []
}>()

interface GroupOption {
	id: string
	label: string
}

const view = useDatabaseView(() => props.database)

const options = computed<GroupOption[]>(() => {
	const db = view.value?.db
	if (!db) {
		return []
	}
	const bin = recycleBin(db)
	const result: GroupOption[] = []
	const walk = (group: KdbxGroup, path: string[]) => {
		if (group === bin || isInRecycleBin(db, group) || group.uuid.id === props.exclude) {
			return
		}
		const groupPath = [...path, group.name ?? '']
		result.push({ id: group.uuid.id, label: groupPath.join(' › ') })
		group.groups.forEach((child) => walk(child, groupPath))
	}
	walk(db.getDefaultGroup(), [])
	return result
})

const selected = shallowRef<GroupOption | null>(options.value.find((option) => option.id === props.currentGroup) ?? null)

const buttons = computed(() => [
	{ label: t('keepassweb', 'Cancel'), callback: () => emit('close') },
	{
		label: t('keepassweb', 'Move'),
		variant: 'primary' as const,
		disabled: !selected.value || selected.value.id === props.currentGroup,
		callback: () => {
			if (selected.value) {
				emit('move', selected.value.id)
			}
		},
	},
])
</script>
