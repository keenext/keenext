<template>
	<NcDialog
		:name="t('keepassweb', 'Set up TOTP')"
		:buttons="buttons"
		@update:open="(open) => open || emit('close')">
		<div class="totp-setup">
			<NcTextField
				v-model="secretOrUri"
				:label="t('keepassweb', 'Secret key or otpauth:// link')"
				:error="secretOrUri !== '' && !config"
				:helperText="secretOrUri !== '' && !config ? t('keepassweb', 'Not a valid base32 secret or otpauth link') : ''" />
			<template v-if="!isUri">
				<NcCheckboxRadioSwitch v-model="steam">
					{{ t('keepassweb', 'Steam Guard codes') }}
				</NcCheckboxRadioSwitch>
				<div class="totp-setup__row">
					<NcTextField v-model="period" :label="t('keepassweb', 'Period (seconds)')" type="number" />
					<NcTextField
						v-if="!steam"
						v-model="digits"
						:label="t('keepassweb', 'Digits')"
						type="number" />
					<NcSelect
						v-if="!steam"
						v-model="algorithm"
						:options="['SHA-1', 'SHA-256', 'SHA-512']"
						:inputLabel="t('keepassweb', 'Algorithm')"
						:clearable="false" />
				</div>
			</template>
			<TotpField v-if="config" :config="config" @copy="() => undefined" />
		</div>
	</NcDialog>
</template>

<script setup lang="ts">
import type { TotpAlgorithm, TotpConfig } from '@/core/totp'

import { computed, ref } from 'vue'
import NcCheckboxRadioSwitch from '@nextcloud/vue/components/NcCheckboxRadioSwitch'
import NcDialog from '@nextcloud/vue/components/NcDialog'
import NcSelect from '@nextcloud/vue/components/NcSelect'
import NcTextField from '@nextcloud/vue/components/NcTextField'
import TotpField from './TotpField.vue'
import { base32Decode, buildOtpUri, parseOtpUri } from '@/core/totp'
import { t } from '@/l10n'

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
	...(props.current ? [{ label: t('keepassweb', 'Remove TOTP'), variant: 'error' as const, callback: () => emit('apply', '') }] : []),
	{ label: t('keepassweb', 'Cancel'), callback: () => emit('close') },
	{
		label: t('keepassweb', 'Save'),
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

.totp-setup__row {
	display: flex;
	gap: 8px;
}
</style>
