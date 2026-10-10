<template>
	<NcDialog
		:name="t('keenext', 'Move to group')"
		:buttons="buttons"
		@update:open="(open) => open || emit('close')">
		<FormField v-slot="{ id }" :label="t('keenext', 'Group')">
			<NcSelect
				v-model="selected"
				:inputId="id"
				:options="options"
				:inputLabel="t('keenext', 'Group')"
				labelOutside
				:clearable="false"
				label="label" />
		</FormField>
	</NcDialog>
</template>

<script setup lang="ts">
import type { KdbxGroup } from 'kdbxweb'
import type { OpenDatabase } from '@/stores/vault'

import { computed, shallowRef } from 'vue'
import NcDialog from '@nextcloud/vue/components/NcDialog'
import NcSelect from '@nextcloud/vue/components/NcSelect'
import FormField from './FormField.vue'
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
	{ label: t('keenext', 'Cancel'), callback: () => emit('close') },
	{
		label: t('keenext', 'Move'),
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
