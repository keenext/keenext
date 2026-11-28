<template>
	<NcDialog
		:name="t('keenext', 'Choose icon')"
		:buttons="buttons"
		size="normal"
		@update:open="(open) => open || emit('close')">
		<h3 class="icon-picker__heading">
			{{ t('keenext', 'Standard icons') }}
		</h3>
		<div class="icon-picker__grid" role="listbox" :aria-label="t('keenext', 'Standard icons')">
			<button
				v-for="index in STANDARD_ICON_COUNT"
				:key="index - 1"
				type="button"
				role="option"
				class="icon-picker__icon"
				:class="{ 'icon-picker__icon--selected': customIcon === null && icon === index - 1 }"
				:aria-selected="customIcon === null && icon === index - 1"
				:aria-label="t('keenext', 'Icon {number}', { number: index - 1 })"
				@click="emit('select', { icon: index - 1, customIcon: null })">
				<NcIconSvgWrapper :path="standardIconPath(index - 1)" :size="24" />
			</button>
		</div>

		<template v-if="customIcons.length > 0">
			<h3 class="icon-picker__heading">
				{{ t('keenext', 'Icons in this database') }}
			</h3>
			<div class="icon-picker__grid" role="listbox" :aria-label="t('keenext', 'Icons in this database')">
				<button
					v-for="custom in customIcons"
					:key="custom.id"
					type="button"
					role="option"
					class="icon-picker__icon"
					:class="{ 'icon-picker__icon--selected': customIcon === custom.id }"
					:aria-selected="customIcon === custom.id"
					:aria-label="custom.name || t('keenext', 'Custom icon')"
					:title="custom.name"
					@click="emit('select', { icon, customIcon: custom.id })">
					<img :src="custom.url" alt="" class="icon-picker__image">
				</button>
			</div>
		</template>

		<div v-if="database.writable" class="icon-picker__upload">
			<NcButton @click="fileInput?.click()">
				<template #icon>
					<NcIconSvgWrapper :path="mdiUpload" />
				</template>
				{{ t('keenext', 'Use an image of your own') }}
			</NcButton>
			<input
				ref="fileInput"
				type="file"
				accept="image/*"
				hidden
				@change="upload">
		</div>
	</NcDialog>
</template>

<script setup lang="ts">
import type { OpenDatabase } from '@/stores/vault'

import { mdiUpload } from '@mdi/js'
import { showError } from '@nextcloud/dialogs'
import { computed, ref } from 'vue'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcDialog from '@nextcloud/vue/components/NcDialog'
import NcIconSvgWrapper from '@nextcloud/vue/components/NcIconSvgWrapper'
import { iconFor, storeIcon } from '@/core/favicons'
import { t } from '@/l10n'
import { iconPng } from '@/services/favicon'
import { customIconUrl, STANDARD_ICON_COUNT, standardIconPath } from '@/services/icons'
import { useVaultStore } from '@/stores/vault'

const props = defineProps<{
	database: OpenDatabase
	icon: number
	customIcon: string | null
}>()

const emit = defineEmits<{
	select: [value: { icon: number, customIcon: string | null }]
	close: []
}>()

const customIcons = computed(() => {
	const db = props.database.session?.db
	if (!db) {
		return []
	}
	return [...db.meta.customIcons].map(([id, custom]) => ({ id, name: custom.name ?? '', url: customIconUrl(db, id) }))
})

const vault = useVaultStore()
const fileInput = ref<HTMLInputElement>()

/** Decoding a huge file would block the tab; icons are shown at 128 px at most. */
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

/**
 * Stores the image in the database right away, as KeePassXC does; an identical icon is
 * reused. It stays in the database even if the entry or group is not saved.
 */
async function upload(event: Event): Promise<void> {
	const input = event.target as HTMLInputElement
	const file = input.files?.[0]
	input.value = ''
	if (!file) {
		return
	}
	try {
		if (file.size > MAX_UPLOAD_BYTES) {
			throw new Error('too large')
		}
		const data = await iconPng(file)
		const id = vault.change(props.database.id, (db) => {
			const icon = iconFor(db, data)
			storeIcon(db, icon)
			return icon.id
		})
		emit('select', { icon: props.icon, customIcon: id })
	} catch {
		showError(t('keenext', 'The image could not be used as icon'))
	}
}

const buttons = computed(() => [
	{ label: t('keenext', 'Close'), callback: () => emit('close') },
])
</script>

<style scoped>
.icon-picker__heading {
	margin: 16px 0 8px;
	font-size: 1em;
	font-weight: bold;
}

.icon-picker__heading:first-child {
	margin-top: 0;
}

.icon-picker__grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(var(--default-clickable-area), 1fr));
	gap: 4px;
}

.icon-picker__icon {
	display: flex;
	align-items: center;
	justify-content: center;
	height: var(--default-clickable-area);
	margin: 0;
	padding: 0;
	border: 2px solid transparent;
	border-radius: var(--border-radius-element, 8px);
	background: transparent;
	cursor: pointer;
}

.icon-picker__icon:hover,
.icon-picker__icon:focus-visible {
	background: var(--color-background-hover);
}

.icon-picker__icon--selected {
	border-color: var(--color-primary-element);
}

.icon-picker__image {
	width: 24px;
	height: 24px;
}

.icon-picker__upload {
	margin-top: 16px;
}
</style>
