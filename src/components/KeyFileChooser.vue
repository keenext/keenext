<template>
	<div class="key-file">
		<div v-if="modelValue" class="key-file__selected">
			<NcIconSvgWrapper :path="mdiFileKey" :size="20" />
			<span class="key-file__name" :title="modelValue.path ?? modelValue.name">{{ modelValue.name }}</span>
			<span class="key-file__source">{{ modelValue.fileId !== undefined ? t('keenext', 'from Nextcloud') : t('keenext', 'from this device') }}</span>
			<NcButton variant="tertiary" :aria-label="t('keenext', 'Remove key file')" @click="emit('update:modelValue', null)">
				<template #icon>
					<NcIconSvgWrapper :path="mdiClose" />
				</template>
			</NcButton>
		</div>
		<div v-else class="key-file__buttons">
			<NcButton @click="chooseFromCloud">
				<template #icon>
					<NcIconSvgWrapper :path="mdiCloudOutline" />
				</template>
				{{ t('keenext', 'Key file from Nextcloud') }}
			</NcButton>
			<NcButton @click="input?.click()">
				<template #icon>
					<NcIconSvgWrapper :path="mdiUpload" />
				</template>
				{{ t('keenext', 'Key file from this device') }}
			</NcButton>
			<input
				ref="input"
				type="file"
				hidden
				@change="chooseLocal">
		</div>
	</div>
</template>

<script setup lang="ts">
import type { KeyFileChoice } from '@/services/keyFile'

import { mdiClose, mdiCloudOutline, mdiFileKey, mdiUpload } from '@mdi/js'
import { ref } from 'vue'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcIconSvgWrapper from '@nextcloud/vue/components/NcIconSvgWrapper'
import { t } from '@/l10n'
import { pickKeyFile } from '@/services/filePicker'

const props = defineProps<{
	modelValue: KeyFileChoice | null
	/** Folder the Nextcloud picker opens in. */
	startAt?: string
}>()

const emit = defineEmits<{
	'update:modelValue': [value: KeyFileChoice | null]
}>()

const input = ref<HTMLInputElement>()

async function chooseFromCloud(): Promise<void> {
	const file = await pickKeyFile(props.startAt)
	if (file) {
		emit('update:modelValue', { name: file.name, fileId: file.fileId, path: file.path })
	}
}

async function chooseLocal(event: Event): Promise<void> {
	const target = event.target as HTMLInputElement
	const file = target.files?.[0]
	if (file) {
		emit('update:modelValue', { name: file.name, data: new Uint8Array(await file.arrayBuffer()) })
	}
	target.value = ''
}
</script>

<style scoped>
.key-file__selected,
.key-file__buttons {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 8px;
}

.key-file__name {
	font-weight: bold;
	overflow-wrap: anywhere;
}

.key-file__source {
	color: var(--color-text-maxcontrast);
}
</style>
