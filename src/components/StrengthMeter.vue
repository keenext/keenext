<template>
	<div
		class="strength"
		:class="`strength--${strength.level}`"
		role="img"
		:aria-label="summary">
		<div class="strength__segments" aria-hidden="true">
			<i v-for="segment in 4" :key="segment" :class="{ 'strength__segment--on': segment <= filled }" />
		</div>
		<div class="strength__text" aria-hidden="true">
			<b>{{ name }}</b>
			<span>{{ t('keenext', '{bits} bits', { bits: strength.bits }) }}</span>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { estimateStrength } from '@/core/generator'
import { t } from '@/l10n'

const props = defineProps<{
	password: string
}>()

const strength = computed(() => estimateStrength(props.password))

const filled = computed(() => ({ poor: 1, weak: 2, good: 3, excellent: 4 })[strength.value.level])

const name = computed(() => ({
	poor: t('keenext', 'Poor'),
	weak: t('keenext', 'Weak'),
	good: t('keenext', 'Good'),
	excellent: t('keenext', 'Excellent'),
})[strength.value.level])

const summary = computed(() => t('keenext', '{quality} ({bits} bits)', { quality: name.value, bits: strength.value.bits }))
</script>

<style scoped>
/* The -text colours are the ones Nextcloud keeps readable on the page background; the plain ones are pale fills.
   The level is told by the word and the number of segments; the colour only backs it up. */
.strength {
	--strength-color: var(--color-error-text);
	--strength-text: var(--color-error-text);
	display: grid;
	gap: 4px;
}

.strength--weak {
	/* Nextcloud has no amber that is both strong enough as a fill and readable on both themes. */
	--strength-color: #c77d00;
	--strength-text: var(--color-warning-text);
}

.strength--good,
.strength--excellent {
	--strength-color: var(--color-success-text);
	--strength-text: var(--color-success-text);
}

.strength__segments {
	display: grid;
	grid-template-columns: repeat(4, 1fr);
	gap: 4px;
}

.strength__segments i {
	height: 6px;
	border-radius: 3px;
	background: var(--color-background-darker);
}

.strength__segments .strength__segment--on {
	background: var(--strength-color);
}

.strength__text {
	display: flex;
	justify-content: space-between;
	gap: 8px;
	font-size: var(--font-size-small, 13px);
	color: var(--color-text-maxcontrast);
}

.strength__text b {
	color: var(--strength-text);
}
</style>
