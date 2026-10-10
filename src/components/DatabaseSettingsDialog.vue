<template>
	<NcDialog
		:name="t('keenext', 'Database settings')"
		:buttons="buttons"
		size="normal"
		@update:open="(open) => open || emit('close')">
		<div v-if="form" class="database-settings">
			<FormSection :label="t('keenext', 'General')">
				<TextInput v-model="form.name" :label="t('keenext', 'Database name')" />
				<TextAreaInput v-model="form.description" :label="t('keenext', 'Description')" resize="vertical" />
				<TextInput v-model="form.defaultUser" :label="t('keenext', 'Default username for new entries')" />
				<NcCheckboxRadioSwitch v-model="form.recycleBinEnabled">
					{{ t('keenext', 'Use recycle bin') }}
				</NcCheckboxRadioSwitch>
				<div class="database-settings__row">
					<TextInput v-model="historyItems" type="number" :label="t('keenext', 'History entries per entry (-1 = unlimited)')" />
					<TextInput v-model="historySizeMiB" type="number" :label="t('keenext', 'History size per entry in MiB (-1 = unlimited)')" />
				</div>
			</FormSection>

			<FormSection :label="t('keenext', 'Encryption')">
				<p class="database-settings__muted">
					{{ t('keenext', 'Format: KDBX {version}', { version: form.version }) }}
				</p>
				<FormField v-slot="{ id }" :label="t('keenext', 'Encryption algorithm')">
					<NcSelect
						v-model="form.cipher"
						:inputId="id"
						:options="['aes', 'chacha20', 'twofish']"
						:getOptionLabel="(option: string) => ({ aes: 'AES-256', chacha20: 'ChaCha20', twofish: 'Twofish' } as Record<string, string>)[option]"
						:inputLabel="t('keenext', 'Encryption algorithm')"
						labelOutside
						:clearable="false" />
				</FormField>
				<template v-if="form.kdf.type === 'aes'">
					<p>{{ t('keenext', 'Key derivation: AES-KDF with {rounds} rounds', { rounds: form.kdf.rounds.toLocaleString() }) }}</p>
					<div>
						<NcButton @click="switchToArgon2">
							{{ t('keenext', 'Switch to Argon2id (upgrades to KDBX 4)') }}
						</NcButton>
					</div>
				</template>
				<template v-else>
					<FormField v-slot="{ id }" :label="t('keenext', 'Key derivation function')">
						<NcSelect
							v-model="form.kdf.type"
							:inputId="id"
							:options="['argon2id', 'argon2d']"
							:getOptionLabel="(option: string) => option === 'argon2id' ? 'Argon2id' : 'Argon2d'"
							:inputLabel="t('keenext', 'Key derivation function')"
							labelOutside
							:clearable="false" />
					</FormField>
					<div class="database-settings__row">
						<TextInput v-model="kdfIterations" type="number" :label="t('keenext', 'Iterations')" />
						<TextInput v-model="kdfMemoryMiB" type="number" :label="t('keenext', 'Memory (MiB)')" />
						<TextInput v-model="kdfParallelism" type="number" :label="t('keenext', 'Parallelism')" />
					</div>
					<p class="database-settings__muted">
						{{ t('keenext', 'Higher values make guessing the password slower, but also unlocking on every device.') }}
					</p>
				</template>
			</FormSection>

			<FormSection :label="t('keenext', 'Master key')">
				<NcCheckboxRadioSwitch v-model="changeKey">
					{{ t('keenext', 'Change password or key file') }}
				</NcCheckboxRadioSwitch>
				<template v-if="changeKey">
					<PasswordInput v-model="newPassword" :label="t('keenext', 'New master password')" autocomplete="new-password" />
					<StrengthMeter v-if="newPassword" :password="newPassword" />
					<PasswordInput
						v-model="repeatPassword"
						:label="t('keenext', 'Repeat new master password')"
						autocomplete="new-password"
						:error="repeatPassword !== '' && repeatPassword !== newPassword" />
					<KeyFileChooser v-model="newKeyFile" :startAt="database.path.slice(0, database.path.lastIndexOf('/')) || '/'" />
				</template>
			</FormSection>

			<NcNoteCard v-if="error" type="error">
				{{ error }}
			</NcNoteCard>
		</div>
	</NcDialog>
</template>

<script setup lang="ts">
import type { DatabaseSettings } from '@/core/database'
import type { KeyFileChoice } from '@/services/keyFile'
import type { OpenDatabase } from '@/stores/vault'

import { computed, ref } from 'vue'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcCheckboxRadioSwitch from '@nextcloud/vue/components/NcCheckboxRadioSwitch'
import NcDialog from '@nextcloud/vue/components/NcDialog'
import NcNoteCard from '@nextcloud/vue/components/NcNoteCard'
import NcSelect from '@nextcloud/vue/components/NcSelect'
import FormField from './FormField.vue'
import FormSection from './FormSection.vue'
import KeyFileChooser from './KeyFileChooser.vue'
import PasswordInput from './PasswordInput.vue'
import StrengthMeter from './StrengthMeter.vue'
import TextAreaInput from './TextAreaInput.vue'
import TextInput from './TextInput.vue'
import { applyDatabaseSettings, DEFAULT_KDF, getDatabaseSettings, prepareCredentials, setCredentials } from '@/core/database'
import { t } from '@/l10n'
import { resolveKeyFile } from '@/services/keyFile'
import { useVaultStore } from '@/stores/vault'

const props = defineProps<{
	database: OpenDatabase
}>()

const emit = defineEmits<{
	close: []
}>()

const MiB = 1024 * 1024
const vault = useVaultStore()
const form = ref<DatabaseSettings | null>(props.database.session ? getDatabaseSettings(props.database.session.db) : null)
const changeKey = ref(false)
const newPassword = ref('')
const repeatPassword = ref('')
const newKeyFile = ref<KeyFileChoice | null>(null)
const busy = ref(false)
const error = ref('')

/** Number inputs as strings, converted on save. */
function numberField(get: () => number, set: (value: number) => void, scale = 1) {
	return computed({
		get: () => String(get() === -1 ? -1 : Math.round(get() / scale)),
		set: (value: string) => {
			const parsed = Number.parseInt(value, 10)
			if (Number.isFinite(parsed)) {
				set(parsed === -1 ? -1 : parsed * scale)
			}
		},
	})
}

const historyItems = numberField(() => form.value!.historyMaxItems, (value) => {
	form.value!.historyMaxItems = value
})
const historySizeMiB = numberField(() => form.value!.historyMaxSize, (value) => {
	form.value!.historyMaxSize = value
}, MiB)
const argon = () => form.value!.kdf as Exclude<DatabaseSettings['kdf'], { type: 'aes' }>
const kdfIterations = numberField(() => argon().iterations, (value) => {
	argon().iterations = Math.max(1, value)
})
const kdfMemoryMiB = numberField(() => argon().memory, (value) => {
	argon().memory = Math.max(1, value) * MiB
}, MiB)
const kdfParallelism = numberField(() => argon().parallelism, (value) => {
	argon().parallelism = Math.max(1, value)
})

function switchToArgon2(): void {
	form.value!.kdf = { ...DEFAULT_KDF }
}

const keyValid = computed(() => !changeKey.value
	|| ((newPassword.value !== '' || newKeyFile.value !== null) && newPassword.value === repeatPassword.value))

/** Resolves to false on failure, which keeps the dialog open with the error shown. */
async function save(): Promise<boolean> {
	if (!form.value || busy.value) {
		return false
	}
	busy.value = true
	error.value = ''
	try {
		const settings: DatabaseSettings = JSON.parse(JSON.stringify(form.value))
		const credentials = changeKey.value
			? await prepareCredentials({ password: newPassword.value === '' ? undefined : newPassword.value, ...(await resolveKeyFile(newKeyFile.value)) })
			: undefined
		vault.change(props.database.id, (db) => {
			applyDatabaseSettings(db, settings)
			if (credentials) {
				setCredentials(db, credentials)
			}
		})
		if (!(await vault.save(props.database.id))) {
			return false
		}
		emit('close')
		return true
	} catch (cause) {
		error.value = vault.describeError(cause)
		return false
	} finally {
		busy.value = false
	}
}

const buttons = computed(() => [
	{ label: t('keenext', 'Cancel'), callback: (): void => emit('close') },
	{ label: busy.value ? t('keenext', 'Saving…') : t('keenext', 'Save'), variant: 'primary' as const, disabled: busy.value || !keyValid.value || !props.database.writable, callback: async () => (await save()) || false },
])
</script>

<style scoped>
.database-settings {
	display: flex;
	flex-direction: column;
	gap: 32px;
}

.database-settings__row {
	display: flex;
	align-items: flex-end;
	gap: 12px;
}

.database-settings__row > * {
	flex: 1;
	min-width: 0;
}

.database-settings__muted {
	color: var(--color-text-maxcontrast);
}
</style>
