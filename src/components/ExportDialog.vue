<template>
	<NcDialog
		:name="t('nextkeeweb', 'Export database')"
		:buttons="buttons"
		@update:open="(open) => open || emit('close')">
		<div class="export">
			<NcCheckboxRadioSwitch
				v-model="format"
				value="xml"
				type="radio"
				name="export-format">
				{{ t('nextkeeweb', 'KeePass XML (KeePass, KeePassXC: everything including history and attachments)') }}
			</NcCheckboxRadioSwitch>
			<NcCheckboxRadioSwitch
				v-model="format"
				value="csv"
				type="radio"
				name="export-format">
				{{ t('nextkeeweb', 'CSV (KeePassXC columns: no attachments, history or custom attributes)') }}
			</NcCheckboxRadioSwitch>
			<NcNoteCard type="warning">
				{{ t('nextkeeweb', 'The export contains all passwords unencrypted. It is downloaded to this device only; delete it when you no longer need it.') }}
			</NcNoteCard>
			<NcCheckboxRadioSwitch v-model="understood">
				{{ t('nextkeeweb', 'I understand that the file is not encrypted') }}
			</NcCheckboxRadioSwitch>
		</div>
	</NcDialog>
</template>

<script setup lang="ts">
import type { OpenDatabase } from '@/stores/vault'

import { computed, ref } from 'vue'
import NcCheckboxRadioSwitch from '@nextcloud/vue/components/NcCheckboxRadioSwitch'
import NcDialog from '@nextcloud/vue/components/NcDialog'
import NcNoteCard from '@nextcloud/vue/components/NcNoteCard'
import { exportCsv, exportXml } from '@/core/transfer'
import { t } from '@/l10n'
import { downloadBlob } from '@/services/download'

const props = defineProps<{
	database: OpenDatabase
}>()

const emit = defineEmits<{
	close: []
}>()

const format = ref<'xml' | 'csv'>('xml')
const understood = ref(false)
const busy = ref(false)

async function download(): Promise<boolean> {
	const db = props.database.session?.db
	if (!db) {
		return false
	}
	busy.value = true
	try {
		const base = props.database.name.replace(/\.kdbx$/i, '')
		if (format.value === 'xml') {
			downloadBlob(`${base}.xml`, await exportXml(db), 'application/xml')
		} else {
			downloadBlob(`${base}.csv`, exportCsv(db), 'text/csv')
		}
		emit('close')
		return true
	} finally {
		busy.value = false
	}
}

const buttons = computed(() => [
	{ label: t('nextkeeweb', 'Cancel'), callback: () => emit('close') },
	{
		label: t('nextkeeweb', 'Download'),
		variant: 'primary' as const,
		disabled: !understood.value || busy.value,
		callback: async () => (await download()) || false,
	},
])
</script>

<style scoped>
.export {
	display: flex;
	flex-direction: column;
	gap: 8px;
}
</style>
