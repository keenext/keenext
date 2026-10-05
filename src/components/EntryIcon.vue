<template>
	<img
		v-if="customUrl"
		:src="customUrl"
		alt=""
		:style="{ width: `${size}px`, height: `${size}px` }">
	<NcIconSvgWrapper v-else :path="standardIconPath(icon, fallback)" :size="size" />
</template>

<script setup lang="ts">
import type { Kdbx } from 'kdbxweb'

import { computed } from 'vue'
import NcIconSvgWrapper from '@nextcloud/vue/components/NcIconSvgWrapper'
import { customIconUrl, standardIconPath } from '@/services/icons'

/** Icon of an entry or group: its custom icon if set and present, else the standard icon. */
const props = withDefaults(defineProps<{
	db: Kdbx
	icon: number | undefined
	customIcon: string | null
	size?: number
	fallback?: string
}>(), {
	size: 24,
	fallback: undefined,
})

const customUrl = computed(() => props.customIcon ? customIconUrl(props.db, props.customIcon) : undefined)
</script>
