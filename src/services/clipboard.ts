let pendingClear: { value: string, timer: ReturnType<typeof setTimeout> } | undefined

async function clearIfUnchanged(value: string): Promise<void> {
	if (pendingClear?.value !== value) {
		return
	}
	try {
		await navigator.clipboard.writeText('')
		pendingClear = undefined
	} catch {
		// The clipboard is only writable while the page has focus; retry on return.
		window.addEventListener('focus', () => void clearIfUnchanged(value), { once: true })
	}
}

/**
 * Copies `value` and clears the clipboard after `clearAfterSeconds` (0 = never).
 * A later copy from this app cancels the earlier clear; copies made in other
 * applications cannot be detected and would be cleared too.
 */
export async function copySecret(value: string, clearAfterSeconds: number): Promise<void> {
	await navigator.clipboard.writeText(value)
	if (pendingClear) {
		clearTimeout(pendingClear.timer)
		pendingClear = undefined
	}
	if (clearAfterSeconds > 0) {
		pendingClear = { value, timer: setTimeout(() => void clearIfUnchanged(value), clearAfterSeconds * 1000) }
	}
}

/** Clears now if a copied secret is still pending, e.g. when locking. */
export function clearPendingSecret(): void {
	if (pendingClear) {
		clearTimeout(pendingClear.timer)
		void clearIfUnchanged(pendingClear.value)
	}
}
