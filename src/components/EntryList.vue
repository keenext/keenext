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
			<NcActions :aria-label="t('keenext', 'Sort and display')" :title="t('keenext', 'Sort and display')">
				<template #icon>
					<NcIconSvgWrapper :path="mdiSort" />
				</template>
				<NcActionCaption :name="t('keenext', 'Sort by')" />
				<NcActionRadio
					v-for="option in sortOptions"
					:key="option.value"
					v-model="preferences.sort"
					:value="option.value"
					name="entry-list-sort">
					{{ option.label }}
				</NcActionRadio>
				<NcActionCheckbox v-model="preferences.descending">
					{{ t('keenext', 'Descending') }}
				</NcActionCheckbox>
				<NcActionSeparator />
				<NcActionCaption :name="t('keenext', 'Second line')" />
				<NcActionRadio
					v-for="option in detailOptions"
					:key="option.value"
					v-model="preferences.detail"
					:value="option.value"
					name="entry-list-detail">
					{{ option.label }}
				</NcActionRadio>
			</NcActions>
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
				@click="openEntry(row.id)">
				<template #icon>
					<EntryIcon
						v-if="view"
						:db="view.db"
						:icon="row.icon"
						:customIcon="row.customIcon" />
				</template>
				<template #subname>
					<span
						v-if="row.color"
						class="entry-list__color"
						:style="{ background: row.color }" />
					{{ row.detail }}
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
import type { DetailLine, ListPreferences, SortKey } from '@/core/listing'
import type { OpenDatabase } from '@/stores/vault'

import { mdiAccount, mdiChevronDown, mdiKey, mdiKeyOutline, mdiMagnify, mdiOpenInNew, mdiPlus, mdiSort } from '@mdi/js'
import { showSuccess } from '@nextcloud/dialogs'
import { computed, reactive, ref, watch } from 'vue'
import NcActionButton from '@nextcloud/vue/components/NcActionButton'
import NcActionCaption from '@nextcloud/vue/components/NcActionCaption'
import NcActionCheckbox from '@nextcloud/vue/components/NcActionCheckbox'
import NcActionLink from '@nextcloud/vue/components/NcActionLink'
import NcActionRadio from '@nextcloud/vue/components/NcActionRadio'
import NcActions from '@nextcloud/vue/components/NcActions'
import NcActionSeparator from '@nextcloud/vue/components/NcActionSeparator'
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
import { listPreferences, sortEntries } from '@/core/listing'
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

const STORAGE_KEY = 'keenext:entry-list'

function loadPreferences(): ListPreferences {
	try {
		return listPreferences(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'))
	} catch {
		return listPreferences(null)
	}
}

/** Kept per browser, like the generator's options. */
const preferences = reactive(loadPreferences())
watch(preferences, () => {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences))
	} catch {
		// Storage may be unavailable (private mode); the defaults return next time.
	}
})

const sortOptions: { value: SortKey, label: string }[] = [
	{ value: 'title', label: t('keenext', 'Title') },
	{ value: 'username', label: t('keenext', 'Username') },
	{ value: 'url', label: t('keenext', 'URL') },
	{ value: 'modified', label: t('keenext', 'Modified') },
	{ value: 'created', label: t('keenext', 'Created') },
	{ value: 'expires', label: t('keenext', 'Expires') },
]

const detailOptions: { value: DetailLine, label: string }[] = [
	{ value: 'username', label: t('keenext', 'Username') },
	{ value: 'url', label: t('keenext', 'URL') },
	{ value: 'modified', label: t('keenext', 'Modified') },
	{ value: 'none', label: t('keenext', 'Nothing') },
]

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
	return sortEntries(entries.value, preferences.sort, preferences.descending)
		.map((entry) => {
			const username = resolvedField(db, entry, StandardField.UserName)
			const url = resolvedField(db, entry, StandardField.URL)
			return {
				id: entry.uuid.id,
				title: getField(entry, StandardField.Title) || t('keenext', '(no title)'),
				username,
				detail: detailLine(entry, username, url),
				href: openableUrl(url),
				expired: isExpired(entry),
				groupName: searching ? entry.parentGroup?.name ?? '' : '',
				icon: entry.icon,
				customIcon: entry.customIcon?.id ?? null,
				color: entry.bgColor || entry.fgColor || null,
			}
		})
})

function detailLine(entry: KdbxEntry, username: string, url: string): string {
	switch (preferences.detail) {
		case 'username': return username
		case 'url': return url
		case 'modified': return entry.times.lastModTime?.toLocaleString() ?? ''
		case 'none': return ''
	}
}

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

async function openEntry(id: string): Promise<void> {
	if (id !== props.database.selectedEntry && await vault.confirmDiscardEdits()) {
		vault.select(props.database.id, { entry: id })
	}
}

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

/* The entry's KeePass color as a marker; coloring the whole row clashes with dark themes. */
.entry-list__color {
	display: inline-block;
	width: 10px;
	height: 10px;
	margin-inline-end: 4px;
	border: 1px solid var(--color-border-maxcontrast);
	border-radius: 50%;
	vertical-align: middle;
}

</style>
