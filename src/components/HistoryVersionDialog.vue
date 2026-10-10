<template>
	<NcDialog
		:name="t('keenext', 'Version from {date}', { date: modified })"
		:buttons="buttons"
		size="normal"
		@update:open="(open) => open || emit('close')">
		<p class="history-version__hint">
			{{ t('keenext', 'Values that differ from the current version are marked.') }}
		</p>
		<dl>
			<FieldRow
				v-for="field in fields"
				:key="field.label"
				:label="field.changed ? `${field.label} •` : field.label"
				:value="field.value"
				:secret="field.secret"
				:multiline="field.value.includes('\n')"
				:class="{ 'history-version__changed': field.changed }"
				@copy="copy(field.value)" />
		</dl>
	</NcDialog>
</template>

<script setup lang="ts">
import type { KdbxEntry } from 'kdbxweb'
import type { EntryDraft } from '@/core/entries'

import { showSuccess } from '@nextcloud/dialogs'
import { computed } from 'vue'
import NcDialog from '@nextcloud/vue/components/NcDialog'
import FieldRow from './FieldRow.vue'
import { draftFromEntry } from '@/core/entries'
import { t } from '@/l10n'
import { copySecret } from '@/services/clipboard'
import { useSettingsStore } from '@/stores/settings'

const props = defineProps<{
	entry: KdbxEntry
	index: number
	canRestore: boolean
}>()

const emit = defineEmits<{
	restore: []
	close: []
}>()

const settingsStore = useSettingsStore()

const modified = computed(() => props.entry.history[props.index]?.times.lastModTime?.toLocaleString() ?? '')

const fields = computed(() => {
	const state = props.entry.history[props.index]
	if (!state) {
		return []
	}
	const old = draftFromEntry(state)
	const current = draftFromEntry(props.entry)
	const standard: [string, keyof Pick<EntryDraft, 'title' | 'username' | 'password' | 'url' | 'notes'>, boolean][] = [
		[t('keenext', 'Title'), 'title', false],
		[t('keenext', 'Username'), 'username', false],
		[t('keenext', 'Password'), 'password', true],
		[t('keenext', 'URL'), 'url', false],
		[t('keenext', 'Notes'), 'notes', false],
	]
	return [
		...standard.map(([label, key, secret]) => ({ label, value: old[key], secret, changed: old[key] !== current[key] })),
		...old.customFields.map((field) => ({
			label: field.key,
			value: field.value,
			secret: field.protected,
			changed: current.customFields.find((other) => other.key === field.key)?.value !== field.value,
		})),
	]
})

async function copy(value: string): Promise<void> {
	await copySecret(value, settingsStore.settings.clipboardClearSeconds)
	showSuccess(t('keenext', 'Copied'))
}

const buttons = computed(() => [
	{ label: t('keenext', 'Close'), callback: () => emit('close') },
	...(props.canRestore ? [{ label: t('keenext', 'Restore this version'), variant: 'primary' as const, callback: () => emit('restore') }] : []),
])
</script>

<style scoped>
.history-version__hint {
	color: var(--color-text-maxcontrast);
	margin-bottom: 8px;
}

dl {
	margin: 0;
	padding: 0;
	border-top: 1px solid var(--color-border);
}

dl :deep(.field-row:last-child) {
	border-bottom: 1px solid var(--color-border);
}

.history-version__changed :deep(.field-row__label) {
	color: var(--color-warning-text);
	font-weight: bold;
}
</style>
