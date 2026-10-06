<template>
	<NcDialog
		:name="t('keenext', 'Set up TOTP')"
		:buttons="buttons"
		@update:open="(open) => open || emit('close')">
		<div class="totp-setup" @paste="onPaste">
			<div class="totp-setup__row">
				<NcButton @click="imageInput?.click()">
					<template #icon>
						<NcIconSvgWrapper :path="mdiQrcodeScan" />
					</template>
					{{ t('keenext', 'Read QR code from image') }}
				</NcButton>
				<input
					ref="imageInput"
					type="file"
					accept="image/*"
					hidden
					@change="onImage">
			</div>
			<p class="totp-setup__hint">
				{{ t('keenext', 'Or paste a screenshot of the QR code here (Ctrl+V).') }}
			</p>
			<NcNoteCard v-if="qrError" type="warning">
				{{ qrError }}
			</NcNoteCard>
			<NcTextField
				v-model="secretOrUri"
				:label="t('keenext', 'Secret key or otpauth:// link')"
				:error="secretOrUri !== '' && !config"
				:helperText="secretOrUri !== '' && !config ? t('keenext', 'Not a valid base32 secret or otpauth link') : ''" />
			<template v-if="!isUri">
				<NcCheckboxRadioSwitch v-model="steam">
					{{ t('keenext', 'Steam Guard codes') }}
				</NcCheckboxRadioSwitch>
				<div class="totp-setup__row">
					<NcTextField v-model="period" :label="t('keenext', 'Period (seconds)')" type="number" />
					<NcTextField
						v-if="!steam"
						v-model="digits"
						:label="t('keenext', 'Digits')"
						type="number" />
					<NcSelect
						v-if="!steam"
						v-model="algorithm"
						:options="['SHA-1', 'SHA-256', 'SHA-512']"
						:inputLabel="t('keenext', 'Algorithm')"
						:clearable="false" />
				</div>
			</template>
			<TotpField v-if="config" :config="config" @copy="() => undefined" />
		</div>
	</NcDialog>
</template>

<script setup lang="ts">
import type { TotpAlgorithm, TotpConfig } from '@/core/totp'

import { mdiQrcodeScan } from '@mdi/js'
import { computed, ref } from 'vue'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcCheckboxRadioSwitch from '@nextcloud/vue/components/NcCheckboxRadioSwitch'
import NcDialog from '@nextcloud/vue/components/NcDialog'
import NcIconSvgWrapper from '@nextcloud/vue/components/NcIconSvgWrapper'
import NcNoteCard from '@nextcloud/vue/components/NcNoteCard'
import NcSelect from '@nextcloud/vue/components/NcSelect'
import NcTextField from '@nextcloud/vue/components/NcTextField'
import TotpField from './TotpField.vue'
import { base32Decode, buildOtpUri, parseOtpUri } from '@/core/totp'
import { t } from '@/l10n'
import { decodeQrImage } from '@/services/qr'

const props = defineProps<{
	/** Current otpauth URI, empty if none. */
	current: string
	label: string
	issuer: string
}>()

const emit = defineEmits<{
	/** otpauth URI, or '' to remove TOTP. */
	apply: [uri: string]
	close: []
}>()

const secretOrUri = ref(props.current)
const imageInput = ref<HTMLInputElement>()
const qrError = ref('')

async function readQr(image: Blob): Promise<void> {
	qrError.value = ''
	const text = await decodeQrImage(image).catch(() => undefined)
	if (!text) {
		qrError.value = t('keenext', 'No QR code found in the image.')
	} else if (text.toLowerCase().startsWith('otpauth-migration://')) {
		qrError.value = t('keenext', 'This is a Google Authenticator export, which is not supported. Use the QR code shown when setting up the account instead.')
	} else if (!parseOtpUri(text)) {
		qrError.value = t('keenext', 'The QR code does not contain a TOTP setup.')
	} else {
		secretOrUri.value = text
	}
}

async function onImage(event: Event): Promise<void> {
	const target = event.target as HTMLInputElement
	const file = target.files?.[0]
	if (file) {
		await readQr(file)
	}
	target.value = ''
}

function onPaste(event: ClipboardEvent): void {
	const image = [...(event.clipboardData?.files ?? [])].find((file) => file.type.startsWith('image/'))
	if (image) {
		event.preventDefault()
		void readQr(image)
	}
}
const steam = ref(false)
const period = ref('30')
const digits = ref('6')
const algorithm = ref<TotpAlgorithm>('SHA-1')

const isUri = computed(() => secretOrUri.value.trim().toLowerCase().startsWith('otpauth://'))

const config = computed<TotpConfig | undefined>(() => {
	const input = secretOrUri.value.trim()
	if (input === '') {
		return undefined
	}
	if (isUri.value) {
		return parseOtpUri(input)
	}
	try {
		const secret = base32Decode(input)
		if (secret.length === 0) {
			return undefined
		}
		return {
			secret,
			period: Math.max(1, Number.parseInt(period.value, 10) || 30),
			digits: steam.value ? 5 : Math.min(10, Math.max(6, Number.parseInt(digits.value, 10) || 6)),
			algorithm: steam.value ? 'SHA-1' : algorithm.value,
			encoder: steam.value ? 'steam' : 'default',
		}
	} catch {
		return undefined
	}
})

const buttons = computed(() => [
	...(props.current ? [{ label: t('keenext', 'Remove TOTP'), variant: 'error' as const, callback: () => emit('apply', '') }] : []),
	{ label: t('keenext', 'Cancel'), callback: () => emit('close') },
	{
		label: t('keenext', 'Save'),
		variant: 'primary' as const,
		disabled: !config.value,
		callback: () => {
			if (config.value) {
				emit('apply', isUri.value ? secretOrUri.value.trim() : buildOtpUri(config.value, props.label, props.issuer || undefined))
			}
		},
	},
])
</script>

<style scoped>
.totp-setup {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.totp-setup__hint {
	color: var(--color-text-maxcontrast);
}

.totp-setup__row {
	display: flex;
	gap: 8px;
}
</style>
