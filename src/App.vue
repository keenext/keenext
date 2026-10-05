<template>
	<NcContent app-name="keepassweb">
		<AppNavigation
			@open-database="openFromPicker"
			@new-database="newDatabaseDirectory = '/'"
			@open-settings="settingsOpen = true" />

		<NcAppContent
			v-if="vault.active?.session"
			:show-details="vault.active.selectedEntry !== null || creatingEntry"
			layout="vertical-split"
			:page-heading="vault.active.name"
			@update:show-details="(show: unknown) => onShowDetails(Boolean(show))">
			<template #list>
				<EntryList :database="vault.active" @create-entry="creatingEntry = true" />
			</template>
			<EntryDetails
				v-if="vault.active.selectedEntry !== null || creatingEntry"
				:key="`${vault.active.id}/${vault.active.selectedEntry ?? 'new'}`"
				:database="vault.active"
				:creating="creatingEntry"
				@done="creatingEntry = false" />
		</NcAppContent>

		<NcAppContent v-else-if="vault.active" :page-heading="vault.active.name">
			<UnlockView :key="vault.active.id" :database="vault.active" />
		</NcAppContent>

		<NcAppContent v-else :page-heading="t('keepassweb', 'KeePass')">
			<StartView @open-database="openFromPicker" @new-database="newDatabaseDirectory = '/'" />
		</NcAppContent>

		<NewDatabaseDialog
			v-if="newDatabaseDirectory !== null"
			:directory="newDatabaseDirectory"
			@close="newDatabaseDirectory = null" />
		<SettingsDialog v-model:open="settingsOpen" />
	</NcContent>
</template>

<script setup lang="ts">
import { showError } from '@nextcloud/dialogs'
import { t } from '@nextcloud/l10n'
import NcAppContent from '@nextcloud/vue/components/NcAppContent'
import NcContent from '@nextcloud/vue/components/NcContent'
import { onMounted, ref, watch } from 'vue'
import AppNavigation from './components/AppNavigation.vue'
import EntryDetails from './components/EntryDetails.vue'
import EntryList from './components/EntryList.vue'
import NewDatabaseDialog from './components/NewDatabaseDialog.vue'
import SettingsDialog from './components/SettingsDialog.vue'
import StartView from './components/StartView.vue'
import UnlockView from './components/UnlockView.vue'
import { useKeyboardShortcuts } from './composables/useKeyboardShortcuts'
import { useLifecycle } from './composables/useLifecycle'
import { pickDatabase } from './services/filePicker'
import { useVaultStore } from './stores/vault'

const vault = useVaultStore()
const settingsOpen = ref(false)
const newDatabaseDirectory = ref<string | null>(null)
const creatingEntry = ref(false)

useLifecycle()
useKeyboardShortcuts({ newEntry: () => { creatingEntry.value = true } })

async function open(fileId: number): Promise<void> {
	try {
		await vault.openFile(fileId)
	} catch (error) {
		showError(t('keepassweb', 'Could not open the database: {error}', { error: vault.describeError(error) }))
	}
}

async function openFromPicker(): Promise<void> {
	const file = await pickDatabase()
	if (file) {
		await open(file.fileId)
	}
}

function onShowDetails(show: boolean): void {
	if (!show && vault.active) {
		vault.active.selectedEntry = null
		creatingEntry.value = false
	}
}

watch(() => [vault.activeId, vault.active?.selectedEntry], () => {
	creatingEntry.value = false
})

// Keep ?fileId= in the address bar so reloading reopens the same database.
watch(() => vault.activeId, (id) => {
	const url = new URL(window.location.href)
	url.searchParams.delete('new')
	url.searchParams.delete('dir')
	if (id) {
		url.searchParams.set('fileId', id)
	} else {
		url.searchParams.delete('fileId')
	}
	window.history.replaceState(null, '', url)
})

onMounted(async () => {
	await vault.loadRecent()
	const params = new URLSearchParams(window.location.search)
	const fileId = Number.parseInt(params.get('fileId') ?? '', 10)
	if (Number.isFinite(fileId)) {
		await open(fileId)
	}
	if (params.get('new') === '1') {
		newDatabaseDirectory.value = params.get('dir') ?? '/'
	}
})
</script>
