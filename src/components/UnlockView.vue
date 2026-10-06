<template>
	<div class="unlock">
		<form class="unlock__form" @submit.prevent="submit">
			<NcIconSvgWrapper :path="mdiShieldLockOutline" :size="64" class="unlock__icon" />
			<h2>{{ t('keenext', 'Unlock {name}', { name: database.name }) }}</h2>
			<p class="unlock__path">
				{{ database.path }}
			</p>

			<NcPasswordField
				ref="passwordField"
				v-model="password"
				:label="t('keenext', 'Password')"
				:checkPasswordStrength="false"
				:disabled="busy"
				autocomplete="current-password"
				autofocus />

			<KeyFileChooser v-model="keyFile" :startAt="database.path.slice(0, database.path.lastIndexOf('/')) || '/'" />

			<NcNoteCard v-if="error" type="error">
				{{ error }}
			</NcNoteCard>
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
				{{ busy ? t('keenext', 'Unlocking…') : t('keenext', 'Unlock') }}
			</NcButton>
			<p class="unlock__hint">
				{{ t('keenext', 'The database is decrypted in your browser. Your password is never sent to the server.') }}
			</p>
		</form>
	</div>
</template>

<script setup lang="ts">
import type { KeyFileChoice } from '@/services/keyFile'
import type { OpenDatabase } from '@/stores/vault'

import { mdiLockOpenVariant, mdiShieldLockOutline } from '@mdi/js'
import { nextTick, ref } from 'vue'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcIconSvgWrapper from '@nextcloud/vue/components/NcIconSvgWrapper'
import NcLoadingIcon from '@nextcloud/vue/components/NcLoadingIcon'
import NcNoteCard from '@nextcloud/vue/components/NcNoteCard'
import NcPasswordField from '@nextcloud/vue/components/NcPasswordField'
import KeyFileChooser from './KeyFileChooser.vue'
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
const passwordField = ref<{ focus?: () => void } | null>(null)

async function submit(): Promise<void> {
	busy.value = true
	error.value = ''
	try {
		const key = await resolveKeyFile(keyFile.value)
		await vault.unlock(props.database.id, { password: password.value === '' && keyFile.value ? undefined : password.value, ...key })
		password.value = ''
	} catch (cause) {
		error.value = vault.describeError(cause)
		busy.value = false
		await nextTick()
		passwordField.value?.focus?.()
	}
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
	text-align: center;
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
