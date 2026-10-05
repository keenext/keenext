<template>
	<FieldRow :label="t('keepassweb', 'TOTP')" :value="code" @copy="emit('copy', code)">
		<span class="totp">
			<span class="totp__code">{{ formatted }}</span>
			<NcProgressBar
				class="totp__progress"
				:value="progress"
				:aria-label="t('keepassweb', '{seconds} seconds remaining', { seconds: remaining })" />
			<span class="totp__remaining">{{ remaining }}s</span>
		</span>
	</FieldRow>
</template>

<script setup lang="ts">
import type { TotpConfig } from '@/core/totp'

import { computed, onBeforeUnmount, ref, watch } from 'vue'
import NcProgressBar from '@nextcloud/vue/components/NcProgressBar'
import FieldRow from './FieldRow.vue'
import { totpCode, totpRemaining } from '@/core/totp'
import { t } from '@/l10n'

const props = defineProps<{
	config: TotpConfig
}>()

const emit = defineEmits<{
	copy: [code: string]
}>()

const code = ref('')
const remaining = ref(props.config.period)
let currentStep = -1

async function tick(): Promise<void> {
	const now = Date.now()
	remaining.value = totpRemaining(props.config, now)
	const step = Math.floor(now / 1000 / props.config.period)
	if (step !== currentStep) {
		currentStep = step
		code.value = await totpCode(props.config, now)
	}
}

const timer = setInterval(() => void tick(), 1000)
watch(() => props.config, () => {
	currentStep = -1
	void tick()
}, { immediate: true })
onBeforeUnmount(() => clearInterval(timer))

const progress = computed(() => Math.round(remaining.value / props.config.period * 100))
/** 123456 → "123 456", like authenticator apps; Steam codes stay as they are. */
const formatted = computed(() => props.config.encoder === 'steam' || code.value.length < 6
	? code.value
	: `${code.value.slice(0, Math.ceil(code.value.length / 2))} ${code.value.slice(Math.ceil(code.value.length / 2))}`)
</script>

<style scoped>
.totp {
	display: flex;
	align-items: center;
	gap: 8px;
}

.totp__code {
	font-family: var(--font-face-monospace, monospace);
	font-size: 1.3em;
	letter-spacing: 1px;
}

.totp__progress {
	max-width: 80px;
}

.totp__remaining {
	color: var(--color-text-maxcontrast);
	min-width: 3ch;
}
</style>
