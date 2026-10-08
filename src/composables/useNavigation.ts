import { emit } from '@nextcloud/event-bus'
import { useIsMobile } from '@nextcloud/vue/composables/useIsMobile'

/**
 * On narrow screens the navigation covers the content. Nextcloud closes it itself
 * only for router links, so items that merely emit `click` have to do it.
 */
export function useNavigation(): { isMobile: ReturnType<typeof useIsMobile>, close: () => void, open: () => void } {
	const isMobile = useIsMobile()
	return {
		isMobile,
		close: () => {
			if (isMobile.value) {
				emit('toggle-navigation', { open: false })
			}
		},
		open: () => emit('toggle-navigation', { open: true }),
	}
}
