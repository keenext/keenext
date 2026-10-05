<template>
	<NcDialog
		:name="title"
		:buttons="buttons"
		isForm
		@submit="submit"
		@update:open="(open) => open || emit('close')">
		<div class="group-dialog__name">
			<NcButton
				:aria-label="t('keepassweb', 'Choose icon')"
				:title="t('keepassweb', 'Choose icon')"
				@click="iconOpen = true">
				<template #icon>
					<EntryIcon
						v-if="database.session"
						:db="database.session.db"
						:icon="draft.icon"
						:customIcon="draft.customIcon" />
				</template>
			</NcButton>
			<NcTextField
				v-model="draft.name"
				:label="t('keepassweb', 'Name')"
				required
				autofocus />
		</div>
		<NcTextArea
			v-model="draft.notes"
			:label="t('keepassweb', 'Notes')"
			resize="vertical" />

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
import NcButton from '@nextcloud/vue/components/NcButton'
import NcDialog from '@nextcloud/vue/components/NcDialog'
import NcTextArea from '@nextcloud/vue/components/NcTextArea'
import NcTextField from '@nextcloud/vue/components/NcTextField'
import EntryIcon from './EntryIcon.vue'
import IconPickerDialog from './IconPickerDialog.vue'
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
	{ label: t('keepassweb', 'Cancel'), callback: () => emit('close') },
	{ label: t('keepassweb', 'Save'), type: 'submit' as const, variant: 'primary' as const, disabled: draft.name.trim() === '' },
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
