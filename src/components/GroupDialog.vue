<template>
	<NcDialog
		:name="title"
		:buttons="buttons"
		isForm
		@submit="submit"
		@update:open="(open) => open || emit('close')">
		<NcTextField
			v-model="name"
			:label="t('keepassweb', 'Name')"
			required
			autofocus />
		<NcTextArea
			v-model="notes"
			:label="t('keepassweb', 'Notes')"
			resize="vertical" />
	</NcDialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import NcDialog from '@nextcloud/vue/components/NcDialog'
import NcTextArea from '@nextcloud/vue/components/NcTextArea'
import NcTextField from '@nextcloud/vue/components/NcTextField'
import { t } from '@/l10n'

const props = defineProps<{
	title: string
	name: string
	notes: string
}>()

const emit = defineEmits<{
	submit: [values: { name: string, notes: string }]
	close: []
}>()

const name = ref(props.name)
const notes = ref(props.notes)

const buttons = computed(() => [
	{ label: t('keepassweb', 'Cancel'), callback: () => emit('close') },
	{ label: t('keepassweb', 'Save'), type: 'submit' as const, variant: 'primary' as const, disabled: name.value.trim() === '' },
])

function submit(): void {
	if (name.value.trim() !== '') {
		emit('submit', { name: name.value.trim(), notes: notes.value })
	}
}
</script>
