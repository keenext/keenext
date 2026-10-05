<template>
	<div class="entry-list">
		<div class="entry-list__header">
			<NcTextField
				v-model="database.query"
				class="entry-list__search"
				:label="t('keepassweb', 'Search')"
				:placeholder="t('keepassweb', 'Search (e.g. github -user:old tag:work)')"
				trailing-button-icon="close"
				:show-trailing-button="database.query !== ''"
				@trailing-button-click="database.query = ''">
				<template #icon>
					<NcIconSvgWrapper :path="mdiMagnify" :size="20" />
				</template>
			</NcTextField>
			<NcButton
				:aria-label="t('keepassweb', 'New entry')"
				:title="t('keepassweb', 'New entry (Ctrl+N)')"
				:disabled="!canCreate"
				variant="primary"
				@click="emit('create-entry')">
				<template #icon>
					<NcIconSvgWrapper :path="mdiPlus" />
				</template>
			</NcButton>
		</div>

		<p class="entry-list__heading">
			{{ heading }}
		</p>

		<ul v-if="rows.length > 0" class="entry-list__items" :aria-label="heading">
			<NcListItem
				v-for="row in rows"
				:key="row.id"
				:name="row.title"
				:active="database.selectedEntry === row.id"
				:class="{ 'entry-list__item--expired': row.expired }"
				:details="row.groupName"
				compact
				@click="database.selectedEntry = row.id">
				<template #icon>
					<img v-if="row.customIcon" :src="row.customIcon" alt="" class="entry-list__custom-icon">
					<NcIconSvgWrapper v-else :path="row.icon" :size="24" />
				</template>
				<template #subname>
					{{ row.username }}
				</template>
				<template #actions>
					<NcActionButton v-if="row.username" close-after-click @click="copy(row.id, 'UserName')">
						<template #icon>
							<NcIconSvgWrapper :path="mdiAccount" />
						</template>
						{{ t('keepassweb', 'Copy username') }}
					</NcActionButton>
					<NcActionButton close-after-click @click="copy(row.id, 'Password')">
						<template #icon>
							<NcIconSvgWrapper :path="mdiKey" />
						</template>
						{{ t('keepassweb', 'Copy password') }}
					</NcActionButton>
					<NcActionLink v-if="row.url" :href="row.url" target="_blank" close-after-click>
						<template #icon>
							<NcIconSvgWrapper :path="mdiOpenInNew" />
						</template>
						{{ t('keepassweb', 'Open URL') }}
					</NcActionLink>
				</template>
			</NcListItem>
		</ul>
		<NcEmptyContent
			v-else
			:name="database.query ? t('keepassweb', 'No matching entries') : t('keepassweb', 'No entries in this group')">
			<template #icon>
				<NcIconSvgWrapper :path="database.query ? mdiMagnify : mdiKeyOutline" />
			</template>
		</NcEmptyContent>
	</div>
</template>

<script setup lang="ts">
import { mdiAccount, mdiKey, mdiKeyOutline, mdiMagnify, mdiOpenInNew, mdiPlus } from '@mdi/js'
import { showSuccess } from '@nextcloud/dialogs'
import { t } from '@nextcloud/l10n'
import NcActionButton from '@nextcloud/vue/components/NcActionButton'
import NcActionLink from '@nextcloud/vue/components/NcActionLink'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcEmptyContent from '@nextcloud/vue/components/NcEmptyContent'
import NcIconSvgWrapper from '@nextcloud/vue/components/NcIconSvgWrapper'
import NcListItem from '@nextcloud/vue/components/NcListItem'
import NcTextField from '@nextcloud/vue/components/NcTextField'
import type { KdbxEntry } from 'kdbxweb'
import { computed } from 'vue'
import { findEntry, findGroup, useDatabaseView } from '@/composables/useDatabase'
import { getField, isExpired, isInRecycleBin, StandardField } from '@/core/entries'
import { resolvedField } from '@/core/placeholders'
import { searchEntries } from '@/core/search'
import { copySecret } from '@/services/clipboard'
import { customIconUrl, standardIconPath } from '@/services/icons'
import { useSettingsStore } from '@/stores/settings'
import type { OpenDatabase } from '@/stores/vault'

const props = defineProps<{
	database: OpenDatabase
}>()

const emit = defineEmits<{
	'create-entry': []
}>()

const settingsStore = useSettingsStore()
const view = useDatabaseView(() => props.database)

const group = computed(() => view.value ? findGroup(view.value.db, props.database.selectedGroup) ?? view.value.db.getDefaultGroup() : undefined)

const canCreate = computed(() => Boolean(view.value && group.value && props.database.writable && !isInRecycleBin(view.value.db, group.value) && group.value.uuid.id !== view.value.db.meta.recycleBinUuid?.id))

const entries = computed<KdbxEntry[]>(() => {
	if (!view.value || !group.value) {
		return []
	}
	if (props.database.query.trim()) {
		return searchEntries(view.value.db, props.database.query)
	}
	return [...group.value.entries]
})

const rows = computed(() => {
	const db = view.value?.db
	if (!db) {
		return []
	}
	const searching = props.database.query.trim() !== ''
	return entries.value
		.map((entry) => ({
			id: entry.uuid.id,
			title: getField(entry, StandardField.Title) || t('keepassweb', '(no title)'),
			username: resolvedField(db, entry, StandardField.UserName),
			url: resolvedField(db, entry, StandardField.URL),
			expired: isExpired(entry),
			groupName: searching ? entry.parentGroup?.name ?? '' : '',
			icon: standardIconPath(entry.icon),
			customIcon: customIconUrl(db, entry),
		}))
		.sort((a, b) => a.title.localeCompare(b.title))
})

const heading = computed(() => {
	if (props.database.query.trim()) {
		return t('keepassweb', '{count} results', { count: rows.value.length })
	}
	return group.value?.name ?? ''
})

async function copy(id: string, field: string): Promise<void> {
	const db = view.value?.db
	const entry = db && findEntry(db, id)
	if (!db || !entry) {
		return
	}
	await copySecret(resolvedField(db, entry, field), settingsStore.settings.clipboardClearSeconds)
	showSuccess(field === StandardField.Password ? t('keepassweb', 'Password copied') : t('keepassweb', 'Username copied'))
}
</script>

<style scoped>
.entry-list {
	display: flex;
	flex-direction: column;
	height: 100%;
}

.entry-list__header {
	display: flex;
	gap: 8px;
	align-items: flex-end;
	padding: 8px 8px 0 calc(var(--default-clickable-area) + 8px);
}

.entry-list__search {
	flex: 1;
}

.entry-list__heading {
	padding: 8px 16px 4px;
	color: var(--color-text-maxcontrast);
	font-weight: bold;
}

.entry-list__items {
	overflow-y: auto;
	padding: 0 4px;
}

.entry-list__item--expired :deep(.list-item-content__name) {
	text-decoration: line-through;
}

.entry-list__custom-icon {
	width: 24px;
	height: 24px;
}
</style>
