<template>
	<div :class="{ 'form-section--framed': framed }">
		<NcFormGroup class="form-section" :label="label">
			<template v-if="$slots.label" #label>
				<slot name="label" />
			</template>
			<slot />
		</NcFormGroup>
	</div>
</template>

<script setup lang="ts">
import NcFormGroup from '@nextcloud/vue/components/NcFormGroup'

/**
 * A group of fields under a bold heading, as Nextcloud's own forms group them. Fields inside
 * are spaced for labels above their inputs (see FormField). Use the `label` slot when the
 * heading carries buttons.
 */
defineProps<{
	label?: string
	/** Draw the group as a card. The frame is a wrapper because a fieldset would put its legend on the border. */
	framed?: boolean
}>()
</script>

<style scoped>
.form-section--framed {
	padding: var(--entry-card-padding, 20px);
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius-large);
}

.form-section {
	--form-group-content-gap: 16px;
	--form-element-label-offset: 0px;
	min-width: 0;
	margin: 0;
	padding: 0;
	border: 0;
}

/* A legend shrinks to its text; buttons in it must reach the right edge. */
.form-section :deep(legend) {
	width: 100%;
	padding: 0;
}
</style>
