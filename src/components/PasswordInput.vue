<template>
	<FormField
		v-slot="{ id }"
		:label="label"
		:class="attrs.class"
		:style="attrs.style as StyleValue">
		<NcPasswordField
			:id="id"
			ref="field"
			v-model="model"
			:label="label"
			labelOutside
			:checkPasswordStrength="false"
			v-bind="inputAttrs" />
	</FormField>
</template>

<script setup lang="ts">
import type { StyleValue } from 'vue'

import { computed, ref, useAttrs } from 'vue'
import NcPasswordField from '@nextcloud/vue/components/NcPasswordField'
import FormField from './FormField.vue'

/** NcPasswordField with its label above the box (see FormField). Class and style go to the field, everything else to the input. */
defineOptions({ inheritAttrs: false })

const model = defineModel<string>({ required: true })
defineProps<{
	label: string
}>()
const field = ref<{ focus?: () => void } | null>(null)
defineExpose({ focus: () => field.value?.focus?.() })

const attrs = useAttrs()
const inputAttrs = computed(() => Object.fromEntries(Object.entries(attrs).filter(([key]) => key !== 'class' && key !== 'style')))
</script>
