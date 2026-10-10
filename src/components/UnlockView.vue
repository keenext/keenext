<template>
	<div class="unlock">
		<form class="unlock__form" @submit.prevent="submit">
			<NcIconSvgWrapper :path="mdiShieldLockOutline" :size="64" class="unlock__icon" />
			<h2>{{ t('keenext', 'Unlock {name}', { name: database.name }) }}</h2>
			<p class="unlock__path">
				{{ database.path }}
			</p>

			<PasswordInput
				ref="passwordField"
				v-model="password"
				:label="t('keenext', 'Password')"
				:disabled="busy"
				autocomplete="current-password"
				autofocus />

			<KeyFileChooser v-model="keyFile" :startAt="database.path.slice(0, database.path.lastIndexOf('/')) || '/'" />

			<NcNoteCard v-if="error" type="error">
				{{ error }}
			</NcNoteCard>
			<CostlyKdfWarning v-if="costlyKdf" :kdf="costlyKdf" />
			<NcNoteCard v-if="!database.writable" type="info">
				{{ t('keenext', 'You can only read this database; changes cannot be saved.') }}
			</NcNoteCard>

			<NcButton
				type="submit"
				variant="primary"
				wide
				:disabled="busy || (password === '' && !keyFile)">
				<template #icon>
					<NcLoadingIcon v-if="busy" :size="20" />
					<NcIconSvgWrapper v-else :path="mdiLockOpenVariant" />
				</template>
				{{ busy ? t('keenext', 'Unlocking…') : costlyKdf ? t('keenext', 'Unlock anyway') : t('keenext', 'Unlock') }}
			</NcButton>
			<NcButton
				v-if="busy"
				variant="tertiary"
				wide
				@click="cancel">
				{{ t('keenext', 'Cancel') }}
			</NcButton>
			<p class="unlock__hint">
				{{ t('keenext', 'The database is decrypted in your browser. Your password is never sent to the server.') }}
			</p>
		</form>
	</div>
</template>

<script setup lang="ts">
import type { Kdf } from '@/core/database'
import type { KeyFileChoice } from '@/services/keyFile'
import type { OpenDatabase } from '@/stores/vault'

import { mdiLockOpenVariant, mdiShieldLockOutline } from '@mdi/js'
import { nextTick, ref } from 'vue'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcIconSvgWrapper from '@nextcloud/vue/components/NcIconSvgWrapper'
import NcLoadingIcon from '@nextcloud/vue/components/NcLoadingIcon'
import NcNoteCard from '@nextcloud/vue/components/NcNoteCard'
import CostlyKdfWarning from './CostlyKdfWarning.vue'
import KeyFileChooser from './KeyFileChooser.vue'
import PasswordInput from './PasswordInput.vue'
import { CostlyKdfError, kdfLimitsAllowing } from '@/core/database'
import { t } from '@/l10n'
import { resolveKeyFile } from '@/services/keyFile'
import { useVaultStore } from '@/stores/vault'

const props = defineProps<{
	database: OpenDatabase
}>()

const vault = useVaultStore()
const password = ref('')
const keyFile = ref<KeyFileChoice | null>(props.database.keyFile ? { ...props.database.keyFile } : null)
const busy = ref(false)
const error = ref('')
/** Set once the file asked for more than the default limits; the next submit accepts it. */
const costlyKdf = ref<Kdf | null>(null)
const passwordField = ref<{ focus?: () => void } | null>(null)
let controller: AbortController | null = null

async function submit(): Promise<void> {
	busy.value = true
	error.value = ''
	controller = new AbortController()
	const { signal } = controller
	try {
		const key = await resolveKeyFile(keyFile.value)
		await vault.unlock(
			props.database.id,
			{ password: password.value === '' && keyFile.value ? undefined : password.value, ...key },
			{ signal, kdfLimits: costlyKdf.value ? kdfLimitsAllowing(costlyKdf.value) : undefined },
		)
		password.value = ''
	} catch (cause) {
		busy.value = false
		if (signal.aborted) {
			return
		}
		if (cause instanceof CostlyKdfError) {
			costlyKdf.value = cause.kdf
			return
		}
		error.value = vault.describeError(cause)
		await nextTick()
		passwordField.value?.focus?.()
	}
}

function cancel(): void {
	controller?.abort()
}
</script>

<style scoped>
.unlock {
	display: flex;
	justify-content: center;
	padding: 48px 16px;
}

.unlock__form {
	display: flex;
	flex-direction: column;
	gap: 12px;
	width: min(420px, 100%);
}

.unlock__icon {
	align-self: center;
	color: var(--color-primary-element);
}

.unlock__form h2 {
	margin: 0;
	font-size: 1.25rem;
	text-align: center;
	text-wrap: balance;
	overflow-wrap: anywhere;
}

.unlock__path,
.unlock__hint {
	color: var(--color-text-maxcontrast);
	text-align: center;
	overflow-wrap: anywhere;
}

.unlock__hint {
	font-size: 0.9em;
}
</style>
