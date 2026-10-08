<template>
	<div class="entry-list">
		<div class="entry-list__header">
			<NcTextField
				:modelValue="database.query"
				class="entry-list__search"
				:label="t('keenext', 'Search')"
				:placeholder="t('keenext', 'Search (e.g. github -user:old tag:work)')"
				trailingButtonIcon="close"
				:showTrailingButton="database.query !== ''"
				@update:modelValue="(value: string | number) => vault.search(database.id, String(value))"
				@trailingButtonClick="vault.search(database.id, '')">
				<template #icon>
					<NcIconSvgWrapper :path="mdiMagnify" :size="20" />
				</template>
			</NcTextField>
			<NcButton
				:aria-label="t('keenext', 'New entry')"
				:title="t('keenext', 'New entry (Ctrl+N)')"
				:disabled="!canCreate"
				variant="primary"
				@click="emit('createEntry')">
				<template #icon>
					<NcIconSvgWrapper :path="mdiPlus" />
				</template>
			</NcButton>
		</div>

		<NcButton
			v-if="navigation.isMobile.value && !searching"
			class="entry-list__group"
			variant="tertiary"
			alignment="start-reverse"
			:aria-label="t('keenext', 'Show groups')"
			@click="navigation.open()">
			<template #icon>
				<NcIconSvgWrapper :path="mdiChevronDown" />
			</template>
			{{ heading }}
		</NcButton>
		<p v-else class="entry-list__heading">
			{{ heading }}
		</p>

		<ul v-if="rows.length > 0" class="entry-list__items" :aria-label="heading">
			<NcListItem
				v-for="row in visibleRows"
				:key="row.id"
				:name="row.title"
				:active="database.selectedEntry === row.id"
				:class="{ 'entry-list__item--expired': row.expired }"
				:details="row.groupName"
				:draggable="database.writable"
				compact
				@dragstart="startDrag($event, ENTRY_TYPE, { database: database.id, uuid: row.id })"
				@click="vault.select(database.id, { entry: row.id })">
				<template #icon>
					<EntryIcon
						v-if="view"
						:db="view.db"
						:icon="row.icon"
						:customIcon="row.customIcon" />
				</template>
				<template #subname>
					{{ row.username }}
				</template>
				<template #actions>
					<NcActionButton v-if="row.username" closeAfterClick @click="copy(row.id, 'UserName')">
						<template #icon>
							<NcIconSvgWrapper :path="mdiAccount" />
						</template>
						{{ t('keenext', 'Copy username') }}
					</NcActionButton>
					<NcActionButton closeAfterClick @click="copy(row.id, 'Password')">
						<template #icon>
							<NcIconSvgWrapper :path="mdiKey" />
						</template>
						{{ t('keenext', 'Copy password') }}
					</NcActionButton>
					<NcActionLink
						v-if="row.href"
						:href="row.href"
						target="_blank"
						closeAfterClick>
						<template #icon>
							<NcIconSvgWrapper :path="mdiOpenInNew" />
						</template>
						{{ t('keenext', 'Open URL') }}
					</NcActionLink>
				</template>
			</NcListItem>
		</ul>
		<NcEmptyContent
			v-else
			:name="database.query ? t('keenext', 'No matching entries') : t('keenext', 'No entries in this group')">
			<template #icon>
				<NcIconSvgWrapper :path="database.query ? mdiMagnify : mdiKeyOutline" />
			</template>
		</NcEmptyContent>
		<NcButton
			v-if="rows.length > visibleRows.length"
			class="entry-list__more"
			wide
			@click="limit = Infinity">
			{{ t('keenext', 'Show all {count} entries', { count: rows.length }) }}
		</NcButton>
	</div>
</template>

<script setup lang="ts">
import type { KdbxEntry } from 'kdbxweb'
import type { OpenDatabase } from '@/stores/vault'

import { mdiAccount, mdiChevronDown, mdiKey, mdiKeyOutline, mdiMagnify, mdiOpenInNew, mdiPlus } from '@mdi/js'
import { showSuccess } from '@nextcloud/dialogs'
import { computed, ref, watch } from 'vue'
import NcActionButton from '@nextcloud/vue/components/NcActionButton'
import NcActionLink from '@nextcloud/vue/components/NcActionLink'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcEmptyContent from '@nextcloud/vue/components/NcEmptyContent'
import NcIconSvgWrapper from '@nextcloud/vue/components/NcIconSvgWrapper'
import NcListItem from '@nextcloud/vue/components/NcListItem'
import NcTextField from '@nextcloud/vue/components/NcTextField'
import EntryIcon from './EntryIcon.vue'
import { findEntry, findGroup, useDatabaseView } from '@/composables/useDatabase'
import { ENTRY_TYPE, startDrag } from '@/composables/useDragAndDrop'
import { useNavigation } from '@/composables/useNavigation'
import { getField, isExpired, isInRecycleBin, StandardField } from '@/core/entries'
import { resolvedField } from '@/core/placeholders'
import { searchEntries } from '@/core/search'
import { openableUrl } from '@/core/urls'
import { n, t } from '@/l10n'
import { copySecret } from '@/services/clipboard'
import { useSettingsStore } from '@/stores/settings'
import { useVaultStore } from '@/stores/vault'

const props = defineProps<{
	database: OpenDatabase
}>()

const emit = defineEmits<{
	createEntry: []
}>()

const settingsStore = useSettingsStore()
const vault = useVaultStore()
const view = useDatabaseView(() => props.database)
const navigation = useNavigation()
const searching = computed(() => props.database.query.trim() !== '')

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
			title: getField(entry, StandardField.Title) || t('keenext', '(no title)'),
			username: resolvedField(db, entry, StandardField.UserName),
			href: openableUrl(resolvedField(db, entry, StandardField.URL)),
			expired: isExpired(entry),
			groupName: searching ? entry.parentGroup?.name ?? '' : '',
			icon: entry.icon,
			customIcon: entry.customIcon?.id ?? null,
		}))
		.sort((a, b) => a.title.localeCompare(b.title))
})

// Rendering thousands of list items is what gets slow, not searching them.
const INITIAL_LIMIT = 200
const limit = ref(INITIAL_LIMIT)
watch(() => [props.database.id, props.database.selectedGroup, props.database.query], () => {
	limit.value = INITIAL_LIMIT
})
const visibleRows = computed(() => rows.value.slice(0, limit.value))

const heading = computed(() => {
	if (props.database.query.trim()) {
		return n('keenext', '{count} result', '{count} results', rows.value.length, { count: rows.value.length })
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
	showSuccess(field === StandardField.Password ? t('keenext', 'Password copied') : t('keenext', 'Username copied'))
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

.entry-list__group {
	align-self: flex-start;
	margin: 4px 8px 0;
	font-weight: bold;
}

.entry-list__more {
	margin: 8px;
	width: auto;
}

.entry-list__items {
	overflow-y: auto;
	padding: 0 4px;
}

.entry-list__item--expired :deep(.list-item-content__name) {
	text-decoration: line-through;
}

</style>
