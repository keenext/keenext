<template>
	<NcDialog
		:name="t('nextkeeweb', 'Choose icon')"
		:buttons="buttons"
		size="normal"
		@update:open="(open) => open || emit('close')">
		<h3 class="icon-picker__heading">
			{{ t('nextkeeweb', 'Standard icons') }}
		</h3>
		<div class="icon-picker__grid" role="listbox" :aria-label="t('nextkeeweb', 'Standard icons')">
			<button
				v-for="index in STANDARD_ICON_COUNT"
				:key="index - 1"
				type="button"
				role="option"
				class="icon-picker__icon"
				:class="{ 'icon-picker__icon--selected': customIcon === null && icon === index - 1 }"
				:aria-selected="customIcon === null && icon === index - 1"
				:aria-label="t('nextkeeweb', 'Icon {number}', { number: index - 1 })"
				@click="emit('select', { icon: index - 1, customIcon: null })">
				<NcIconSvgWrapper :path="standardIconPath(index - 1)" :size="24" />
			</button>
		</div>

		<template v-if="customIcons.length > 0">
			<h3 class="icon-picker__heading">
				{{ t('nextkeeweb', 'Icons in this database') }}
			</h3>
			<div class="icon-picker__grid" role="listbox" :aria-label="t('nextkeeweb', 'Icons in this database')">
				<button
					v-for="custom in customIcons"
					:key="custom.id"
					type="button"
					role="option"
					class="icon-picker__icon"
					:class="{ 'icon-picker__icon--selected': customIcon === custom.id }"
					:aria-selected="customIcon === custom.id"
					:aria-label="custom.name || t('nextkeeweb', 'Custom icon')"
					:title="custom.name"
					@click="emit('select', { icon, customIcon: custom.id })">
					<img :src="custom.url" alt="" class="icon-picker__image">
				</button>
			</div>
		</template>
	</NcDialog>
</template>

<script setup lang="ts">
import type { OpenDatabase } from '@/stores/vault'

import { computed } from 'vue'
import NcDialog from '@nextcloud/vue/components/NcDialog'
import NcIconSvgWrapper from '@nextcloud/vue/components/NcIconSvgWrapper'
import { t } from '@/l10n'
import { customIconUrl, STANDARD_ICON_COUNT, standardIconPath } from '@/services/icons'

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

const buttons = computed(() => [
	{ label: t('nextkeeweb', 'Close'), callback: () => emit('close') },
])
</script>

<style scoped>
.icon-picker__heading {
	margin: 8px 0;
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
</style>
