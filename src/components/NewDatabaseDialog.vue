<template>
	<NcDialog
		:name="t('keepassweb', 'New KeePass database')"
		:buttons="buttons"
		is-form
		@submit="submit"
		@update:open="(open) => open || emit('close')">
		<div class="new-database">
			<NcTextField v-model="name" :label="t('keepassweb', 'File name')" autofocus />
			<div class="new-database__folder">
				<span>{{ t('keepassweb', 'Folder: {folder}', { folder }) }}</span>
				<NcButton variant="tertiary" @click="chooseFolder">
					{{ t('keepassweb', 'Change') }}
				</NcButton>
			</div>
			<NcPasswordField
				v-model="password"
				:label="t('keepassweb', 'Master password')"
				autocomplete="new-password"
				:check-password-strength="false" />
			<StrengthMeter v-if="password" :password="password" />
			<NcPasswordField
				v-model="repeat"
				:label="t('keepassweb', 'Repeat master password')"
				autocomplete="new-password"
				:check-password-strength="false"
				:error="repeat !== '' && repeat !== password"
				:helper-text="repeat !== '' && repeat !== password ? t('keepassweb', 'Passwords do not match') : ''" />
			<KeyFileChooser v-model="keyFile" />
			<NcNoteCard v-if="error" type="error">
				{{ error }}
			</NcNoteCard>
			<p class="new-database__hint">
				{{ t('keepassweb', 'KDBX 4 with Argon2id and ChaCha20. Without the master password the database cannot be recovered.') }}
			</p>
		</div>
	</NcDialog>
</template>

<script setup lang="ts">
import { t } from '@nextcloud/l10n'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcDialog from '@nextcloud/vue/components/NcDialog'
import NcNoteCard from '@nextcloud/vue/components/NcNoteCard'
import NcPasswordField from '@nextcloud/vue/components/NcPasswordField'
import NcTextField from '@nextcloud/vue/components/NcTextField'
import { computed, ref } from 'vue'
import { pickFolder } from '@/services/filePicker'
import { type KeyFileChoice, resolveKeyFile } from '@/services/keyFile'
import { useVaultStore } from '@/stores/vault'
import KeyFileChooser from './KeyFileChooser.vue'
import StrengthMeter from './StrengthMeter.vue'

const props = defineProps<{
	directory: string
}>()

const emit = defineEmits<{
	close: []
}>()

const vault = useVaultStore()
const name = ref(t('keepassweb', 'Passwords'))
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
	const chosen = await pickFolder()
	if (chosen) {
		folder.value = chosen
	}
}

async function submit(): Promise<void> {
	if (!valid.value || busy.value) {
		return
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
	} catch (cause) {
		error.value = vault.describeError(cause)
	} finally {
		busy.value = false
	}
}

const buttons = computed(() => [
	{ label: t('keepassweb', 'Cancel'), callback: () => emit('close') },
	{ label: busy.value ? t('keepassweb', 'Creating…') : t('keepassweb', 'Create'), type: 'submit' as const, variant: 'primary' as const, disabled: !valid.value || busy.value },
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
