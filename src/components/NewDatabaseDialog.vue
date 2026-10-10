<template>
	<NcDialog
		:name="t('keenext', 'New KeePass database')"
		:buttons="buttons"
		isForm
		@submit="submit"
		@update:open="(open) => open || emit('close')">
		<div class="new-database">
			<TextInput v-model="name" :label="t('keenext', 'File name')" autofocus />
			<div class="new-database__folder">
				<span>{{ t('keenext', 'Folder: {folder}', { folder }) }}</span>
				<NcButton variant="tertiary" @click="chooseFolder">
					{{ t('keenext', 'Change') }}
				</NcButton>
			</div>
			<PasswordInput v-model="password" :label="t('keenext', 'Master password')" autocomplete="new-password" />
			<StrengthMeter v-if="password" :password="password" />
			<PasswordInput
				v-model="repeat"
				:label="t('keenext', 'Repeat master password')"
				autocomplete="new-password"
				:error="repeat !== '' && repeat !== password"
				:helperText="repeat !== '' && repeat !== password ? t('keenext', 'Passwords do not match') : ''" />
			<KeyFileChooser v-model="keyFile" :startAt="folder" />
			<NcNoteCard v-if="error" type="error">
				{{ error }}
			</NcNoteCard>
			<p class="new-database__hint">
				{{ t('keenext', 'KDBX 4 with Argon2id and ChaCha20. Without the master password the database cannot be recovered.') }}
			</p>
		</div>
	</NcDialog>
</template>

<script setup lang="ts">
import type { KeyFileChoice } from '@/services/keyFile'

import { computed, ref } from 'vue'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcDialog from '@nextcloud/vue/components/NcDialog'
import NcNoteCard from '@nextcloud/vue/components/NcNoteCard'
import KeyFileChooser from './KeyFileChooser.vue'
import PasswordInput from './PasswordInput.vue'
import StrengthMeter from './StrengthMeter.vue'
import TextInput from './TextInput.vue'
import { t } from '@/l10n'
import { pickFolder } from '@/services/filePicker'
import { resolveKeyFile } from '@/services/keyFile'
import { useVaultStore } from '@/stores/vault'

const props = defineProps<{
	directory: string
}>()

const emit = defineEmits<{
	close: []
}>()

const vault = useVaultStore()
const name = ref(t('keenext', 'Passwords'))
const folder = ref(props.directory || '/')
const password = ref('')
const repeat = ref('')
const keyFile = ref<KeyFileChoice | null>(null)
const busy = ref(false)
const error = ref('')

const valid = computed(() => name.value.trim() !== ''
	&& !/[/\\]/.test(name.value)
	&& (password.value !== '' || keyFile.value !== null)
	&& password.value === repeat.value)

async function chooseFolder(): Promise<void> {
	const chosen = await pickFolder(folder.value)
	if (chosen) {
		folder.value = chosen
	}
}

/** Resolves to false on failure, which keeps the dialog open with the error shown. */
async function submit(): Promise<boolean> {
	if (!valid.value || busy.value) {
		return false
	}
	busy.value = true
	error.value = ''
	try {
		const key = await resolveKeyFile(keyFile.value)
		await vault.create({
			directory: folder.value,
			name: name.value.trim(),
			credentials: { password: password.value === '' ? undefined : password.value, ...key },
		})
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
	{ label: t('keenext', 'Cancel'), callback: () => emit('close') },
	{ label: busy.value ? t('keenext', 'Creating…') : t('keenext', 'Create'), variant: 'primary' as const, disabled: !valid.value || busy.value, callback: async () => (await submit()) || false },
])
</script>

<style scoped>
.new-database {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.new-database__folder {
	display: flex;
	align-items: center;
	gap: 8px;
	overflow-wrap: anywhere;
}

.new-database__hint {
	color: var(--color-text-maxcontrast);
	font-size: 0.9em;
}
</style>
