<template>
	<NcAppSettingsDialog
		:open="open"
		:name="t('keepassweb', 'KeePass Web settings')"
		show-navigation
		@update:open="(value) => emit('update:open', value)">
		<NcAppSettingsSection id="security" :name="t('keepassweb', 'Security')">
			<NcTextField
				:model-value="String(settings.lockAfterMinutes)"
				type="number"
				:label="t('keepassweb', 'Lock databases after inactivity (minutes, 0 = never)')"
				@update:model-value="(value) => updateLater({ lockAfterMinutes: toInt(value) })" />
			<NcCheckboxRadioSwitch :model-value="settings.lockOnHide" @update:model-value="(value: boolean) => update({ lockOnHide: value })">
				{{ t('keepassweb', 'Lock databases when the tab is hidden') }}
			</NcCheckboxRadioSwitch>
			<NcTextField
				:model-value="String(settings.clipboardClearSeconds)"
				type="number"
				:label="t('keepassweb', 'Clear clipboard after (seconds, 0 = never)')"
				@update:model-value="(value) => updateLater({ clipboardClearSeconds: toInt(value) })" />
			<NcCheckboxRadioSwitch :model-value="settings.rememberKeyFile" @update:model-value="(value: boolean) => update({ rememberKeyFile: value })">
				{{ t('keepassweb', 'Remember which key file belongs to a database') }}
			</NcCheckboxRadioSwitch>
		</NcAppSettingsSection>

		<NcAppSettingsSection id="saving" :name="t('keepassweb', 'Saving')">
			<NcCheckboxRadioSwitch :model-value="settings.autosave" @update:model-value="(value: boolean) => update({ autosave: value })">
				{{ t('keepassweb', 'Save automatically after every change') }}
			</NcCheckboxRadioSwitch>
			<NcTextField
				:model-value="String(settings.syncIntervalSeconds)"
				type="number"
				:label="t('keepassweb', 'Check for changes made elsewhere every (seconds, 0 = never)')"
				@update:model-value="(value) => updateLater({ syncIntervalSeconds: toInt(value) })" />
		</NcAppSettingsSection>

		<NcAppSettingsSection id="shortcuts" :name="t('keepassweb', 'Keyboard shortcuts')">
			<dl class="shortcuts">
				<dt><kbd>Ctrl</kbd> + <kbd>S</kbd></dt>
				<dd>{{ t('keepassweb', 'Save database') }}</dd>
				<dt><kbd>Ctrl</kbd> + <kbd>L</kbd></dt>
				<dd>{{ t('keepassweb', 'Lock all databases') }}</dd>
				<dt><kbd>Ctrl</kbd> + <kbd>N</kbd></dt>
				<dd>{{ t('keepassweb', 'New entry') }}</dd>
				<dt><kbd>Ctrl</kbd> + <kbd>F</kbd></dt>
				<dd>{{ t('keepassweb', 'Search') }}</dd>
			</dl>
		</NcAppSettingsSection>
	</NcAppSettingsDialog>
</template>

<script setup lang="ts">
import { showError } from '@nextcloud/dialogs'
import { t } from '@nextcloud/l10n'
import NcAppSettingsDialog from '@nextcloud/vue/components/NcAppSettingsDialog'
import NcAppSettingsSection from '@nextcloud/vue/components/NcAppSettingsSection'
import NcCheckboxRadioSwitch from '@nextcloud/vue/components/NcCheckboxRadioSwitch'
import NcTextField from '@nextcloud/vue/components/NcTextField'
import { storeToRefs } from 'pinia'
import type { Settings } from '@/services/api'
import { useSettingsStore } from '@/stores/settings'

defineProps<{
	open: boolean
}>()

const emit = defineEmits<{
	'update:open': [value: boolean]
}>()

const settingsStore = useSettingsStore()
const { settings } = storeToRefs(settingsStore)

function toInt(value: string | number): number {
	const parsed = Number.parseInt(String(value), 10)
	return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
}

async function update(changes: Partial<Settings>): Promise<void> {
	try {
		await settingsStore.update(changes)
	} catch {
		showError(t('keepassweb', 'Could not save the settings'))
	}
}

let pending: Partial<Settings> = {}
let timer: ReturnType<typeof setTimeout> | undefined

/** For typed numbers: collect keystrokes into one request. */
function updateLater(changes: Partial<Settings>): void {
	pending = { ...pending, ...changes }
	settings.value = { ...settings.value, ...changes }
	clearTimeout(timer)
	timer = setTimeout(() => {
		const batch = pending
		pending = {}
		void update(batch)
	}, 600)
}
</script>

<style scoped>
.shortcuts {
	display: grid;
	grid-template-columns: max-content 1fr;
	gap: 4px 16px;
}
</style>
