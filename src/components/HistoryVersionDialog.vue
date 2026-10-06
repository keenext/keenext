<template>
	<NcDialog
		:name="t('nextkeeweb', 'Version from {date}', { date: modified })"
		:buttons="buttons"
		size="normal"
		@update:open="(open) => open || emit('close')">
		<p class="history-version__hint">
			{{ t('nextkeeweb', 'Values that differ from the current version are marked.') }}
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
		[t('nextkeeweb', 'Title'), 'title', false],
		[t('nextkeeweb', 'Username'), 'username', false],
		[t('nextkeeweb', 'Password'), 'password', true],
		[t('nextkeeweb', 'URL'), 'url', false],
		[t('nextkeeweb', 'Notes'), 'notes', false],
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
	showSuccess(t('nextkeeweb', 'Copied'))
}

const buttons = computed(() => [
	{ label: t('nextkeeweb', 'Close'), callback: () => emit('close') },
	...(props.canRestore ? [{ label: t('nextkeeweb', 'Restore this version'), variant: 'primary' as const, callback: () => emit('restore') }] : []),
])
</script>

<style scoped>
.history-version__hint {
	color: var(--color-text-maxcontrast);
	margin-bottom: 8px;
}

.history-version__changed :deep(.field-row__label) {
	color: var(--color-warning-text);
	font-weight: bold;
}
</style>
