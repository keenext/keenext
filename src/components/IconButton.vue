<template>
	<NcButton
		class="icon-button"
		variant="secondary"
		:aria-label="label"
		:aria-pressed="pressed"
		:title="title ?? label"
		:disabled="disabled">
		<template #icon>
			<slot>
				<NcIconSvgWrapper :path="path" />
			</slot>
		</template>
	</NcButton>
</template>

<script setup lang="ts">
import NcButton from '@nextcloud/vue/components/NcButton'
import NcIconSvgWrapper from '@nextcloud/vue/components/NcIconSvgWrapper'

/**
 * The one look for icon-only buttons: secondary, so they read as buttons, and always the
 * same size. A toggle shows its state through the icon and `aria-pressed`, not through a
 * primary-coloured fill that would pass for the main action.
 */
defineProps<{
	/** Accessible name and, unless `title` is set, tooltip. */
	label: string
	/** SVG path of the icon; use the default slot for anything else. */
	path?: string
	title?: string
	pressed?: boolean
	disabled?: boolean
}>()
</script>
