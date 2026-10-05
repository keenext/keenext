<template>
	<NcDialog
		:name="t('keepassweb', 'Move to group')"
		:buttons="buttons"
		@update:open="(open) => open || emit('close')">
		<NcSelect
			v-model="selected"
			:options="options"
			:input-label="t('keepassweb', 'Group')"
			:clearable="false"
			label="label" />
	</NcDialog>
</template>

<script setup lang="ts">
import { t } from '@nextcloud/l10n'
import NcDialog from '@nextcloud/vue/components/NcDialog'
import NcSelect from '@nextcloud/vue/components/NcSelect'
import type { KdbxGroup } from 'kdbxweb'
import { computed, markRaw, type Raw, shallowRef } from 'vue'
import { useDatabaseView } from '@/composables/useDatabase'
import { isInRecycleBin, recycleBin } from '@/core/entries'
import type { OpenDatabase } from '@/stores/vault'

const props = defineProps<{
	database: OpenDatabase
	currentGroup: string | null
}>()

const emit = defineEmits<{
	move: [group: KdbxGroup]
	close: []
}>()

interface GroupOption {
	id: string
	label: string
	group: Raw<KdbxGroup>
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
		if (group === bin || isInRecycleBin(db, group)) {
			return
		}
		const groupPath = [...path, group.name ?? '']
		result.push({ id: group.uuid.id, label: groupPath.join(' › '), group: markRaw(group) })
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
				emit('move', selected.value.group)
			}
		},
	},
])
</script>
