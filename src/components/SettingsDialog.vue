<template>
	<NcAppSettingsDialog
		:open="open"
		:name="t('keenext', 'KeeNext settings')"
		showNavigation
		@update:open="(value) => emit('update:open', value)">
		<NcAppSettingsSection id="security" :name="t('keenext', 'Security')">
			<div class="settings-group">
				<NcTextField
					:modelValue="String(settings.lockAfterMinutes)"
					type="number"
					:label="t('keenext', 'Lock databases after inactivity (minutes, 0 = never)')"
					@update:modelValue="(value) => updateLater({ lockAfterMinutes: toInt(value) })" />
				<NcCheckboxRadioSwitch :modelValue="settings.lockOnHide" @update:modelValue="(value: boolean) => update({ lockOnHide: value })">
					{{ t('keenext', 'Lock databases when the tab is hidden') }}
				</NcCheckboxRadioSwitch>
				<NcTextField
					:modelValue="String(settings.clipboardClearSeconds)"
					type="number"
					:label="t('keenext', 'Clear clipboard after (seconds, 0 = never)')"
					@update:modelValue="(value) => updateLater({ clipboardClearSeconds: toInt(value) })" />
				<NcCheckboxRadioSwitch :modelValue="settings.rememberKeyFile" @update:modelValue="(value: boolean) => update({ rememberKeyFile: value })">
					{{ t('keenext', 'Remember which key file belongs to a database') }}
				</NcCheckboxRadioSwitch>
			</div>
		</NcAppSettingsSection>

		<NcAppSettingsSection id="saving" :name="t('keenext', 'Saving')">
			<div class="settings-group">
				<NcCheckboxRadioSwitch :modelValue="settings.autosave" @update:modelValue="(value: boolean) => update({ autosave: value })">
					{{ t('keenext', 'Save automatically after every change') }}
				</NcCheckboxRadioSwitch>
				<NcTextField
					:modelValue="String(settings.syncIntervalSeconds)"
					type="number"
					:label="t('keenext', 'Check for changes made elsewhere every (seconds, 0 = never)')"
					@update:modelValue="(value) => updateLater({ syncIntervalSeconds: toInt(value) })" />
			</div>
		</NcAppSettingsSection>

		<NcAppSettingsSection v-if="!isMobile" id="shortcuts" :name="t('keenext', 'Keyboard shortcuts')">
			<div class="settings-group">
				<dl class="shortcuts">
					<dt><kbd>Ctrl</kbd> + <kbd>S</kbd></dt>
					<dd>{{ t('keenext', 'Save database') }}</dd>
					<dt><kbd>Ctrl</kbd> + <kbd>L</kbd></dt>
					<dd>{{ t('keenext', 'Lock all databases') }}</dd>
					<dt><kbd>Ctrl</kbd> + <kbd>N</kbd></dt>
					<dd>{{ t('keenext', 'New entry') }}</dd>
					<dt><kbd>Ctrl</kbd> + <kbd>F</kbd></dt>
					<dd>{{ t('keenext', 'Search') }}</dd>
				</dl>
			</div>
		</NcAppSettingsSection>
	</NcAppSettingsDialog>
</template>

<script setup lang="ts">
import type { Settings } from '@/services/api'

import { showError } from '@nextcloud/dialogs'
import { storeToRefs } from 'pinia'
import NcAppSettingsDialog from '@nextcloud/vue/components/NcAppSettingsDialog'
import NcAppSettingsSection from '@nextcloud/vue/components/NcAppSettingsSection'
import NcCheckboxRadioSwitch from '@nextcloud/vue/components/NcCheckboxRadioSwitch'
import NcTextField from '@nextcloud/vue/components/NcTextField'
import { useNavigation } from '@/composables/useNavigation'
import { t } from '@/l10n'
import { useSettingsStore } from '@/stores/settings'

defineProps<{
	open: boolean
}>()

const emit = defineEmits<{
	'update:open': [value: boolean]
}>()

const { isMobile } = useNavigation()
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
		showError(t('keenext', 'Could not save the settings'))
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
.settings-group {
	display: flex;
	flex-direction: column;
	gap: 12px;
	max-width: 32rem;
	padding-top: 8px;
}

/* Nextcloud styles bare dt/dd as a right-aligned label column with padding. */
.shortcuts {
	display: grid;
	grid-template-columns: max-content 1fr;
	align-items: center;
	gap: 8px 24px;
	margin: 0;
	padding-inline: 12px;
}

.shortcuts dt,
.shortcuts dd {
	width: auto;
	margin: 0;
	padding: 0;
	text-align: start;
}
</style>
