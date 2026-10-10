<template>
	<div class="form-field">
		<label class="form-field__label" :class="{ 'hidden-visually': hideLabel }" :for="id">{{ label }}</label>
		<slot :id="id" />
	</div>
</template>

<script setup lang="ts">
import { useId } from 'vue'

/**
 * A form field with its label above the input, the way Nextcloud's own settings pages do it.
 * The label sits outside the input's border, so it never crowds the value. The input gets
 * the generated id through the slot and must be rendered with `labelOutside`.
 */
defineProps<{
	label: string
	/** Keep the label for assistive technology only, e.g. under a heading that says the same. */
	hideLabel?: boolean
}>()

const id = useId()
</script>

<style scoped>
.form-field {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-width: 0;
}

.form-field__label {
	font-weight: 500;
}
</style>
