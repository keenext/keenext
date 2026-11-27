<template>
	<NcDialog
		:name="name"
		:buttons="buttons"
		size="large"
		@update:open="(open) => open || emit('close')">
		<img
			v-if="kind === 'image'"
			:src="imageUrl"
			:alt="name"
			class="attachment-preview__image">
		<pre v-else class="attachment-preview__text">{{ text }}</pre>
	</NcDialog>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount } from 'vue'
import NcDialog from '@nextcloud/vue/components/NcDialog'
import { imageType, previewKind } from '@/core/preview'
import { decodeText } from '@/core/transfer'
import { t } from '@/l10n'

const props = defineProps<{
	name: string
	data: Uint8Array
}>()

const emit = defineEmits<{
	download: []
	close: []
}>()

const kind = previewKind(props.name, props.data.byteLength)
// The object URL lives as long as the dialog; the bytes never leave the browser.
const imageUrl = kind === 'image' ? URL.createObjectURL(new Blob([props.data as Uint8Array<ArrayBuffer>], { type: imageType(props.name) })) : ''
const text = kind === 'text' ? decodeText(props.data) : ''

onBeforeUnmount(() => {
	if (imageUrl) {
		URL.revokeObjectURL(imageUrl)
	}
})

const buttons = computed(() => [
	{ label: t('keenext', 'Download'), callback: () => emit('download') },
	{ label: t('keenext', 'Close'), variant: 'primary' as const, callback: () => emit('close') },
])
</script>

<style scoped>
.attachment-preview__image {
	display: block;
	max-width: 100%;
	max-height: 70vh;
	margin: 0 auto;
	object-fit: contain;
}

.attachment-preview__text {
	max-height: 70vh;
	overflow: auto;
	padding: 8px;
	border-radius: var(--border-radius);
	background: var(--color-background-dark);
	white-space: pre-wrap;
	overflow-wrap: anywhere;
	font-size: 0.9em;
}
</style>
