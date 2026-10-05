import { onBeforeUnmount, onMounted, watch } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { useVaultStore } from '@/stores/vault'

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const

/**
 * App-wide behaviour around open databases: idle and hide locking, polling
 * for changes made elsewhere, and the unsaved-changes warning on leave.
 */
export function useLifecycle(): void {
	const vault = useVaultStore()
	const settingsStore = useSettingsStore()
	let lastActivity = Date.now()
	let idleTimer: ReturnType<typeof setInterval> | undefined
	let syncTimer: ReturnType<typeof setInterval> | undefined

	const onActivity = () => {
		lastActivity = Date.now()
	}

	const onVisibility = () => {
		if (document.visibilityState === 'hidden' && settingsStore.settings.lockOnHide) {
			void vault.lockAll()
		}
		if (document.visibilityState === 'visible') {
			void vault.syncAll()
		}
	}

	const onBeforeUnload = (event: BeforeUnloadEvent) => {
		if (vault.anyDirty) {
			event.preventDefault()
		}
	}

	function restartSyncTimer(): void {
		clearInterval(syncTimer)
		const seconds = settingsStore.settings.syncIntervalSeconds
		if (seconds > 0) {
			syncTimer = setInterval(() => {
				if (document.visibilityState === 'visible') {
					void vault.syncAll()
				}
			}, seconds * 1000)
		}
	}

	onMounted(() => {
		for (const event of ACTIVITY_EVENTS) {
			window.addEventListener(event, onActivity, { passive: true })
		}
		document.addEventListener('visibilitychange', onVisibility)
		window.addEventListener('beforeunload', onBeforeUnload)
		idleTimer = setInterval(() => {
			const minutes = settingsStore.settings.lockAfterMinutes
			if (minutes > 0 && Date.now() - lastActivity > minutes * 60_000) {
				lastActivity = Date.now()
				void vault.lockAll()
			}
		}, 10_000)
		restartSyncTimer()
	})

	watch(() => settingsStore.settings.syncIntervalSeconds, restartSyncTimer)

	onBeforeUnmount(() => {
		for (const event of ACTIVITY_EVENTS) {
			window.removeEventListener(event, onActivity)
		}
		document.removeEventListener('visibilitychange', onVisibility)
		window.removeEventListener('beforeunload', onBeforeUnload)
		clearInterval(idleTimer)
		clearInterval(syncTimer)
	})
}
