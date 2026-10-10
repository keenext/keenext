<template>
	<NcDialog
		:name="title"
		:buttons="buttons"
		isForm
		@submit="submit"
		@update:open="(open) => open || emit('close')">
		<div class="group-dialog">
			<div class="group-dialog__name">
				<IconButton :label="t('keenext', 'Choose icon')" @click="iconOpen = true">
					<EntryIcon
						v-if="database.session"
						:db="database.session.db"
						:icon="draft.icon"
						:customIcon="draft.customIcon" />
				</IconButton>
				<TextInput
					v-model="draft.name"
					:label="t('keenext', 'Name')"
					required
					autofocus />
			</div>
			<TextAreaInput v-model="draft.notes" :label="t('keenext', 'Notes')" resize="vertical" />
		</div>

		<IconPickerDialog
			v-if="iconOpen"
			:database="database"
			:icon="draft.icon"
			:customIcon="draft.customIcon"
			@select="selectIcon"
			@close="iconOpen = false" />
	</NcDialog>
</template>

<script setup lang="ts">
import type { GroupDraft } from '@/core/groups'
import type { OpenDatabase } from '@/stores/vault'

import { computed, reactive, ref } from 'vue'
import NcDialog from '@nextcloud/vue/components/NcDialog'
import EntryIcon from './EntryIcon.vue'
import IconButton from './IconButton.vue'
import IconPickerDialog from './IconPickerDialog.vue'
import TextAreaInput from './TextAreaInput.vue'
import TextInput from './TextInput.vue'
import { t } from '@/l10n'

const props = defineProps<{
	database: OpenDatabase
	title: string
	initial: GroupDraft
}>()

const emit = defineEmits<{
	submit: [values: GroupDraft]
	close: []
}>()

const draft = reactive({ ...props.initial })
const iconOpen = ref(false)

const buttons = computed(() => [
	{ label: t('keenext', 'Cancel'), callback: () => emit('close') },
	{ label: t('keenext', 'Save'), type: 'submit' as const, variant: 'primary' as const, disabled: draft.name.trim() === '' },
])

function selectIcon(value: { icon: number, customIcon: string | null }): void {
	draft.icon = value.icon
	draft.customIcon = value.customIcon
	iconOpen.value = false
}

function submit(): void {
	if (draft.name.trim() !== '') {
		emit('submit', { ...draft, name: draft.name.trim() })
	}
}
</script>

<style scoped>
.group-dialog__name {
	display: flex;
	align-items: flex-end;
	gap: 8px;
}

.group-dialog__name > :last-child {
	flex: 1;
}
</style>
