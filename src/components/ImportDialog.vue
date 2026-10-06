<template>
	<NcDialog
		:name="t('keenext', 'Import into {name}', { name: database.name })"
		:buttons="buttons"
		size="normal"
		@update:open="(open) => open || emit('close')">
		<div class="import">
			<p class="import__hint">
				{{ t('keenext', 'Supported: KeePass databases (.kdbx, merged if it is another copy of this database), KeePass XML, CSV (KeePassXC, Bitwarden, browsers and others) and unencrypted Bitwarden JSON.') }}
			</p>
			<div v-if="!source" class="import__buttons">
				<NcButton @click="chooseFromCloud">
					<template #icon>
						<NcIconSvgWrapper :path="mdiCloudOutline" />
					</template>
					{{ t('keenext', 'File from Nextcloud') }}
				</NcButton>
				<NcButton @click="input?.click()">
					<template #icon>
						<NcIconSvgWrapper :path="mdiUpload" />
					</template>
					{{ t('keenext', 'File from this device') }}
				</NcButton>
				<input
					ref="input"
					type="file"
					accept=".kdbx,.xml,.csv,.json"
					hidden
					@change="chooseLocal">
			</div>
			<div v-else class="import__source">
				<NcIconSvgWrapper :path="mdiFileImportOutline" :size="20" />
				<strong>{{ source.name }}</strong>
				<span class="import__muted">{{ formatLabel }}</span>
				<NcButton variant="tertiary" :aria-label="t('keenext', 'Choose another file')" @click="source = null">
					<template #icon>
						<NcIconSvgWrapper :path="mdiClose" />
					</template>
				</NcButton>
			</div>

			<template v-if="format === 'kdbx'">
				<NcPasswordField
					v-model="password"
					:label="t('keenext', 'Password of the database to import')"
					:checkPasswordStrength="false"
					autocomplete="off" />
				<KeyFileChooser v-model="keyFile" />
			</template>

			<p v-if="source && format !== 'kdbx'" class="import__muted">
				{{ t('keenext', 'Entries are added to a new group "{group}" in "{target}".', { group: groupName, target: targetName }) }}
			</p>
			<NcNoteCard v-if="source && !format" type="error">
				{{ t('keenext', 'Unknown file type. Use .kdbx, .xml, .csv or .json.') }}
			</NcNoteCard>
			<NcNoteCard v-if="error" type="error">
				{{ error }}
			</NcNoteCard>
		</div>
	</NcDialog>
</template>

<script setup lang="ts">
import type { Kdbx } from 'kdbxweb'
import type { ImportResult } from '@/core/transfer'
import type { KeyFileChoice } from '@/services/keyFile'
import type { OpenDatabase } from '@/stores/vault'

import { mdiClose, mdiCloudOutline, mdiFileImportOutline, mdiUpload } from '@mdi/js'
import { showSuccess } from '@nextcloud/dialogs'
import { computed, ref } from 'vue'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcDialog from '@nextcloud/vue/components/NcDialog'
import NcIconSvgWrapper from '@nextcloud/vue/components/NcIconSvgWrapper'
import NcNoteCard from '@nextcloud/vue/components/NcNoteCard'
import NcPasswordField from '@nextcloud/vue/components/NcPasswordField'
import KeyFileChooser from './KeyFileChooser.vue'
import { findGroup } from '@/composables/useDatabase'
import { createCredentials, openDatabase } from '@/core/database'
import { isInRecycleBin, recycleBin } from '@/core/entries'
import { importBitwarden, importCsv, importDatabase, loadXmlDatabase } from '@/core/transfer'
import { n, t } from '@/l10n'
import { pickImportFile } from '@/services/filePicker'
import { resolveKeyFile } from '@/services/keyFile'
import { downloadFileById } from '@/services/webdav'
import { useVaultStore } from '@/stores/vault'

const props = defineProps<{
	database: OpenDatabase
}>()

const emit = defineEmits<{
	close: []
}>()

interface Source {
	name: string
	fileId?: number
	data?: Uint8Array
}

const vault = useVaultStore()
const input = ref<HTMLInputElement>()
const source = ref<Source | null>(null)
const password = ref('')
const keyFile = ref<KeyFileChoice | null>(null)
const busy = ref(false)
const error = ref('')

const format = computed(() => {
	const extension = /\.(\w+)$/.exec(source.value?.name ?? '')?.[1]?.toLowerCase()
	return extension === 'kdbx' || extension === 'xml' || extension === 'csv' || extension === 'json' ? extension : undefined
})

const formatLabel = computed(() => ({
	kdbx: t('keenext', 'KeePass database'),
	xml: t('keenext', 'KeePass XML'),
	csv: t('keenext', 'CSV'),
	json: t('keenext', 'Bitwarden JSON'),
})[format.value ?? 'csv'])

const groupName = computed(() => t('keenext', 'Import {name}', { name: source.value?.name.replace(/\.\w+$/, '') ?? '' }))

/** Imports go below the selected group, never into the recycle bin. */
function targetGroup(db: Kdbx) {
	const selected = findGroup(db, props.database.selectedGroup)
	return selected && selected !== recycleBin(db) && !isInRecycleBin(db, selected) ? selected : db.getDefaultGroup()
}

const targetName = computed(() => {
	void props.database.revision
	const db = props.database.session?.db
	return db ? targetGroup(db).name ?? '' : ''
})

async function chooseFromCloud(): Promise<void> {
	const directory = props.database.path.slice(0, props.database.path.lastIndexOf('/')) || '/'
	const file = await pickImportFile(directory)
	if (file) {
		source.value = { name: file.name, fileId: file.fileId }
		error.value = ''
	}
}

async function chooseLocal(event: Event): Promise<void> {
	const target = event.target as HTMLInputElement
	const file = target.files?.[0]
	if (file) {
		source.value = { name: file.name, data: new Uint8Array(await file.arrayBuffer()) }
		error.value = ''
	}
	target.value = ''
}

/** Resolves to false on failure, which keeps the dialog open with the error shown. */
async function run(): Promise<boolean> {
	if (!source.value || !format.value) {
		return false
	}
	busy.value = true
	error.value = ''
	try {
		const data = source.value.data ?? await downloadFileById(source.value.fileId!)
		const text = format.value === 'kdbx' ? '' : new TextDecoder().decode(data)
		// Async parts first: vault.change runs the mutation synchronously.
		const other = format.value === 'kdbx'
			? await openDatabase(data, createCredentials({ password: password.value === '' && keyFile.value ? undefined : password.value, ...(await resolveKeyFile(keyFile.value)) }))
			: format.value === 'xml' ? await loadXmlDatabase(text) : undefined
		const name = groupName.value
		const result: ImportResult = vault.change(props.database.id, (db) => {
			const target = targetGroup(db)
			if (other) {
				return importDatabase(db, target, name, other)
			}
			return format.value === 'csv' ? importCsv(db, target, name, text) : importBitwarden(db, target, name, text)
		})
		vault.select(props.database.id, { group: result.group.uuid.id, entry: null })
		showSuccess(result.merged
			? t('keenext', 'Merged {name} into this database', { name: source.value.name })
			: n('keenext', 'Imported {count} entry', 'Imported {count} entries', result.entries, { count: result.entries }))
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
	{
		label: busy.value ? t('keenext', 'Importing…') : t('keenext', 'Import'),
		variant: 'primary' as const,
		disabled: !source.value || !format.value || busy.value || !props.database.writable,
		callback: async () => (await run()) || false,
	},
])
</script>

<style scoped>
.import {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.import__buttons,
.import__source {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 8px;
}

.import__hint,
.import__muted {
	color: var(--color-text-maxcontrast);
}
</style>
