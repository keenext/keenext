<template>
	<NcDialog
		:name="t('nextkeeweb', 'Database settings')"
		:buttons="buttons"
		size="normal"
		@update:open="(open) => open || emit('close')">
		<div v-if="form" class="database-settings">
			<h3>{{ t('nextkeeweb', 'General') }}</h3>
			<NcTextField v-model="form.name" :label="t('nextkeeweb', 'Database name')" />
			<NcTextArea v-model="form.description" :label="t('nextkeeweb', 'Description')" resize="vertical" />
			<NcTextField v-model="form.defaultUser" :label="t('nextkeeweb', 'Default username for new entries')" />
			<NcCheckboxRadioSwitch v-model="form.recycleBinEnabled">
				{{ t('nextkeeweb', 'Use recycle bin') }}
			</NcCheckboxRadioSwitch>
			<div class="database-settings__row">
				<NcTextField v-model="historyItems" type="number" :label="t('nextkeeweb', 'History entries per entry (-1 = unlimited)')" />
				<NcTextField v-model="historySizeMiB" type="number" :label="t('nextkeeweb', 'History size per entry in MiB (-1 = unlimited)')" />
			</div>

			<h3>{{ t('nextkeeweb', 'Encryption') }}</h3>
			<p class="database-settings__muted">
				{{ t('nextkeeweb', 'Format: KDBX {version}', { version: form.version }) }}
			</p>
			<NcSelect
				v-model="form.cipher"
				:options="['aes', 'chacha20', 'twofish']"
				:getOptionLabel="(option: string) => ({ aes: 'AES-256', chacha20: 'ChaCha20', twofish: 'Twofish' } as Record<string, string>)[option]"
				:inputLabel="t('nextkeeweb', 'Encryption algorithm')"
				:clearable="false" />
			<template v-if="form.kdf.type === 'aes'">
				<p>{{ t('nextkeeweb', 'Key derivation: AES-KDF with {rounds} rounds', { rounds: form.kdf.rounds.toLocaleString() }) }}</p>
				<NcButton @click="switchToArgon2">
					{{ t('nextkeeweb', 'Switch to Argon2id (upgrades to KDBX 4)') }}
				</NcButton>
			</template>
			<template v-else>
				<NcSelect
					v-model="form.kdf.type"
					:options="['argon2id', 'argon2d']"
					:getOptionLabel="(option: string) => option === 'argon2id' ? 'Argon2id' : 'Argon2d'"
					:inputLabel="t('nextkeeweb', 'Key derivation function')"
					:clearable="false" />
				<div class="database-settings__row">
					<NcTextField v-model="kdfIterations" type="number" :label="t('nextkeeweb', 'Iterations')" />
					<NcTextField v-model="kdfMemoryMiB" type="number" :label="t('nextkeeweb', 'Memory (MiB)')" />
					<NcTextField v-model="kdfParallelism" type="number" :label="t('nextkeeweb', 'Parallelism')" />
				</div>
				<p class="database-settings__muted">
					{{ t('nextkeeweb', 'Higher values make guessing the password slower, but also unlocking on every device.') }}
				</p>
			</template>

			<h3>{{ t('nextkeeweb', 'Master key') }}</h3>
			<NcCheckboxRadioSwitch v-model="changeKey">
				{{ t('nextkeeweb', 'Change password or key file') }}
			</NcCheckboxRadioSwitch>
			<template v-if="changeKey">
				<NcPasswordField
					v-model="newPassword"
					:label="t('nextkeeweb', 'New master password')"
					autocomplete="new-password"
					:checkPasswordStrength="false" />
				<StrengthMeter v-if="newPassword" :password="newPassword" />
				<NcPasswordField
					v-model="repeatPassword"
					:label="t('nextkeeweb', 'Repeat new master password')"
					autocomplete="new-password"
					:checkPasswordStrength="false"
					:error="repeatPassword !== '' && repeatPassword !== newPassword" />
				<KeyFileChooser v-model="newKeyFile" :startAt="database.path.slice(0, database.path.lastIndexOf('/')) || '/'" />
			</template>

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
import NcPasswordField from '@nextcloud/vue/components/NcPasswordField'
import NcSelect from '@nextcloud/vue/components/NcSelect'
import NcTextArea from '@nextcloud/vue/components/NcTextArea'
import NcTextField from '@nextcloud/vue/components/NcTextField'
import KeyFileChooser from './KeyFileChooser.vue'
import StrengthMeter from './StrengthMeter.vue'
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

async function save(): Promise<void> {
	if (!form.value || busy.value) {
		return
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
			return
		}
		emit('close')
	} catch (cause) {
		error.value = vault.describeError(cause)
	} finally {
		busy.value = false
	}
}

const buttons = computed(() => [
	{ label: t('nextkeeweb', 'Cancel'), callback: (): void => emit('close') },
	{ label: busy.value ? t('nextkeeweb', 'Saving…') : t('nextkeeweb', 'Save'), variant: 'primary' as const, disabled: busy.value || !keyValid.value || !props.database.writable, callback: (): void => { void save() } },
])
</script>

<style scoped>
.database-settings {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.database-settings h3 {
	margin: 12px 0 0;
}

.database-settings__row {
	display: flex;
	gap: 8px;
}

.database-settings__muted {
	color: var(--color-text-maxcontrast);
}
</style>
