import type { Settings } from '@/services/api'

import { loadState } from '@nextcloud/initial-state'
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { DEFAULT_SETTINGS, saveSettings } from '@/services/api'

export const useSettingsStore = defineStore('settings', () => {
	const settings = ref<Settings>({ ...DEFAULT_SETTINGS, ...loadState<Partial<Settings>>('nextkeeweb', 'settings', {}) })

	async function update(changes: Partial<Settings>): Promise<void> {
		settings.value = { ...settings.value, ...changes }
		settings.value = await saveSettings(changes)
	}

	return { settings, update }
})
