<template>
	<NcFormGroup class="form-section" :label="label">
		<template v-if="$slots.label" #label>
			<slot name="label" />
		</template>
		<slot />
	</NcFormGroup>
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
}>()
</script>

<style scoped>
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
