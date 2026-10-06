<template>
	<svg
		class="qr-code"
		:viewBox="`0 0 ${qr.size} ${qr.size}`"
		:width="pixels"
		:height="pixels"
		role="img"
		:aria-label="label"
		shape-rendering="crispEdges">
		<rect :width="qr.size" :height="qr.size" fill="#fff" />
		<path :d="qr.path" fill="#000" />
	</svg>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { qrPath } from '@/services/qr'

const props = withDefaults(defineProps<{
	value: string
	label: string
	pixels?: number
}>(), {
	pixels: 240,
})

const qr = computed(() => qrPath(props.value))
</script>

<style scoped>
.qr-code {
	/* Black on white in dark themes too; scanners expect that. */
	background: #fff;
	border-radius: var(--border-radius-element, 8px);
}
</style>
