<template>
	<FieldRow :label="t('keenext', 'TOTP')" :value="code" @copy="emit('copy', code)">
		<span class="totp">
			<span class="totp__code">{{ formatted }}</span>
			<NcProgressBar
				class="totp__progress"
				:value="progress"
				:aria-label="t('keenext', '{seconds} seconds remaining', { seconds: remaining })" />
			<span class="totp__remaining">{{ remaining }}s</span>
		</span>
		<template v-if="uri" #actions>
			<IconButton :label="t('keenext', 'Show QR code')" :path="mdiQrcode" @click="qrOpen = true" />
		</template>
	</FieldRow>
	<NcDialog
		v-if="qrOpen && uri"
		:name="t('keenext', 'TOTP as QR code')"
		:buttons="[{ label: t('keenext', 'Close'), callback: () => { qrOpen = false } }]"
		@update:open="(open) => qrOpen = open">
		<div class="totp__qr">
			<QrCode :value="uri" :label="t('keenext', 'QR code for the authenticator app')" />
			<p>{{ t('keenext', 'Scan with an authenticator app to add this account. Anyone who sees this code can generate your one-time codes.') }}</p>
		</div>
	</NcDialog>
</template>

<script setup lang="ts">
import type { TotpConfig } from '@/core/totp'

import { mdiQrcode } from '@mdi/js'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import NcDialog from '@nextcloud/vue/components/NcDialog'
import NcProgressBar from '@nextcloud/vue/components/NcProgressBar'
import FieldRow from './FieldRow.vue'
import IconButton from './IconButton.vue'
import QrCode from './QrCode.vue'
import { totpCode, totpRemaining } from '@/core/totp'
import { t } from '@/l10n'

const props = defineProps<{
	config: TotpConfig
	/** otpauth URI offered as QR code; none in previews like the setup dialog. */
	uri?: string
}>()

const emit = defineEmits<{
	copy: [code: string]
}>()

const code = ref('')
const qrOpen = ref(false)
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
	gap: 12px;
}

.totp__code {
	font-family: var(--font-face-monospace, monospace);
	font-size: 1.5em;
	letter-spacing: 2px;
	white-space: nowrap;
}

.totp__progress {
	flex: 1;
	min-width: 32px;
	max-width: 120px;
}

.totp__qr {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 12px;
	text-align: center;
}

.totp__remaining {
	color: var(--color-text-maxcontrast);
	min-width: 3ch;
	white-space: nowrap;
}
</style>
