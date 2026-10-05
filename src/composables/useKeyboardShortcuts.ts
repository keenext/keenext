import { onBeforeUnmount, onMounted } from 'vue'
import { useVaultStore } from '@/stores/vault'

/** KeePassXC shortcuts: Ctrl+S save, Ctrl+L lock all, Ctrl+N new entry, Ctrl+F search. */
export function useKeyboardShortcuts(actions: { newEntry: () => void }): void {
	const vault = useVaultStore()

	const onKeyDown = (event: KeyboardEvent) => {
		if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) {
			return
		}
		const active = vault.active
		switch (event.key.toLowerCase()) {
			case 's':
				if (active?.session && active.writable) {
					event.preventDefault()
					void vault.save(active.id)
				}
				break
			case 'l':
				event.preventDefault()
				void vault.lockAll()
				break
			case 'n':
				if (active?.session && active.writable) {
					event.preventDefault()
					actions.newEntry()
				}
				break
			case 'f':
				if (active?.session) {
					event.preventDefault()
					document.querySelector<HTMLInputElement>('.entry-list__search input')?.focus()
				}
				break
		}
	}

	onMounted(() => window.addEventListener('keydown', onKeyDown))
	onBeforeUnmount(() => window.removeEventListener('keydown', onKeyDown))
}
