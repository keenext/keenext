<template>
	<FormField
		v-slot="{ id }"
		:label="label"
		:class="attrs.class"
		:style="attrs.style as StyleValue">
		<NcTextArea
			:id="id"
			v-model="model"
			:label="label"
			labelOutside
			v-bind="inputAttrs" />
	</FormField>
</template>

<script setup lang="ts">
import type { StyleValue } from 'vue'

import { computed, useAttrs } from 'vue'
import NcTextArea from '@nextcloud/vue/components/NcTextArea'
import FormField from './FormField.vue'

/** NcTextArea with its label above the box (see FormField). Class and style go to the field, everything else to the input. */
defineOptions({ inheritAttrs: false })

const model = defineModel<string>({ required: true })

defineProps<{
	label: string
}>()

const attrs = useAttrs()
const inputAttrs = computed(() => Object.fromEntries(Object.entries(attrs).filter(([key]) => key !== 'class' && key !== 'style')))
</script>
