<template>
	<div class="strength" :class="`strength--${strength.level}`">
		<NcProgressBar
			class="strength__bar"
			:value="Math.min(100, strength.bits)"
			:color="color"
			:aria-label="label" />
		<span class="strength__label">{{ label }}</span>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import NcProgressBar from '@nextcloud/vue/components/NcProgressBar'
import { estimateStrength } from '@/core/generator'
import { t } from '@/l10n'

const props = defineProps<{
	password: string
}>()

const strength = computed(() => estimateStrength(props.password))

const color = computed(() => ({
	poor: 'var(--color-error)',
	weak: 'var(--color-warning)',
	good: 'var(--color-success)',
	excellent: 'var(--color-success)',
})[strength.value.level])

const label = computed(() => {
	const names = {
		poor: t('keenext', 'Poor'),
		weak: t('keenext', 'Weak'),
		good: t('keenext', 'Good'),
		excellent: t('keenext', 'Excellent'),
	}
	return t('keenext', '{quality} ({bits} bits)', { quality: names[strength.value.level], bits: strength.value.bits })
})
</script>

<style scoped>
.strength {
	display: flex;
	align-items: center;
	gap: 8px;
}

.strength__bar {
	flex: 1;
	min-width: 80px;
}

.strength__label {
	color: var(--color-text-maxcontrast);
	white-space: nowrap;
	font-size: 0.9em;
}
</style>
