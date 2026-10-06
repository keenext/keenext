<template>
	<div class="entry-details">
		<EntryEditor
			v-if="creating || editing"
			:database="database"
			:entry="creating ? null : entry ?? null"
			@saved="onSaved"
			@cancel="onCancel" />

		<template v-else-if="entry && view">
			<header class="entry-details__header">
				<EntryIcon
					class="entry-details__icon"
					:db="view.db"
					:icon="entry.icon"
					:customIcon="entry.customIcon?.id ?? null"
					:size="40" />
				<div class="entry-details__heading">
					<h2>{{ details.title || t('nextkeeweb', '(no title)') }}</h2>
					<p class="entry-details__path">
						{{ details.path }}
					</p>
				</div>
				<NcButton v-if="database.writable" variant="primary" @click="editing = true">
					<template #icon>
						<NcIconSvgWrapper :path="mdiPencil" />
					</template>
					{{ t('nextkeeweb', 'Edit') }}
				</NcButton>
				<NcActions v-if="database.writable" :aria-label="t('nextkeeweb', 'More actions')">
					<NcActionButton closeAfterClick @click="clone">
						<template #icon>
							<NcIconSvgWrapper :path="mdiContentDuplicate" />
						</template>
						{{ t('nextkeeweb', 'Clone entry') }}
					</NcActionButton>
					<NcActionButton closeAfterClick @click="moving = true">
						<template #icon>
							<NcIconSvgWrapper :path="mdiFolderMove" />
						</template>
						{{ t('nextkeeweb', 'Move to group') }}
					</NcActionButton>
					<NcActionButton closeAfterClick @click="remove">
						<template #icon>
							<NcIconSvgWrapper :path="mdiDelete" />
						</template>
						{{ details.inRecycleBin ? t('nextkeeweb', 'Delete permanently') : t('nextkeeweb', 'Delete') }}
					</NcActionButton>
				</NcActions>
			</header>

			<NcNoteCard v-if="details.expired" type="warning">
				{{ t('nextkeeweb', 'This entry expired on {date}', { date: formatDate(details.expires) }) }}
			</NcNoteCard>

			<dl class="entry-details__fields">
				<FieldRow :label="t('nextkeeweb', 'Username')" :value="details.username" @copy="copy(details.username, t('nextkeeweb', 'Username copied'))" />
				<FieldRow
					:label="t('nextkeeweb', 'Password')"
					:value="details.password"
					secret
					@copy="copy(details.password, t('nextkeeweb', 'Password copied'))" />
				<FieldRow
					:label="t('nextkeeweb', 'URL')"
					:value="details.url"
					link
					@copy="copy(details.url, t('nextkeeweb', 'URL copied'))" />
				<TotpField v-if="details.totp" :config="details.totp" @copy="(code) => copy(code, t('nextkeeweb', 'TOTP copied'))" />
				<FieldRow
					v-for="field in details.customFields"
					:key="field.key"
					:label="field.key"
					:value="field.value"
					:secret="field.protected"
					:multiline="field.value.includes('\n')"
					@copy="copy(field.value, t('nextkeeweb', '{field} copied', { field: field.key }))" />
				<FieldRow
					v-if="details.expires"
					:label="t('nextkeeweb', 'Expires')"
					:value="formatDate(details.expires)"
					@copy="copy(formatDate(details.expires), t('nextkeeweb', 'Copied'))" />
			</dl>

			<div v-if="details.tags.length > 0" class="entry-details__tags">
				<NcChip
					v-for="tag in details.tags"
					:key="tag"
					:text="tag"
					noClose />
			</div>

			<section v-if="details.notes" class="entry-details__section">
				<h3>{{ t('nextkeeweb', 'Notes') }}</h3>
				<p class="entry-details__notes">
					{{ details.notes }}
				</p>
			</section>

			<section v-if="details.attachments.length > 0" class="entry-details__section">
				<h3>{{ t('nextkeeweb', 'Attachments') }}</h3>
				<ul>
					<li v-for="attachment in details.attachments" :key="attachment.name" class="entry-details__attachment">
						<NcIconSvgWrapper :path="mdiPaperclip" :size="20" />
						<span>{{ attachment.name }}</span>
						<span class="entry-details__muted">{{ formatSize(attachment.size) }}</span>
						<NcButton variant="tertiary" :aria-label="t('nextkeeweb', 'Download {name}', { name: attachment.name })" @click="download(attachment.name)">
							<template #icon>
								<NcIconSvgWrapper :path="mdiDownload" />
							</template>
						</NcButton>
					</li>
				</ul>
			</section>

			<section v-if="details.history.length > 0" class="entry-details__section">
				<h3>
					<NcButton variant="tertiary" :aria-expanded="showHistory" @click="showHistory = !showHistory">
						<template #icon>
							<NcIconSvgWrapper :path="mdiHistory" />
						</template>
						{{ t('nextkeeweb', 'History ({count})', { count: details.history.length }) }}
					</NcButton>
				</h3>
				<ul v-if="showHistory">
					<li v-for="state in details.history" :key="state.index" class="entry-details__history">
						<NcButton variant="tertiary" @click="historyIndex = state.index">
							{{ formatDate(state.modified) }}
						</NcButton>
						<span class="entry-details__muted">{{ state.summary }}</span>
						<NcActions v-if="database.writable" :aria-label="t('nextkeeweb', 'History actions')">
							<NcActionButton closeAfterClick @click="restore(state.index)">
								<template #icon>
									<NcIconSvgWrapper :path="mdiRestore" />
								</template>
								{{ t('nextkeeweb', 'Restore this version') }}
							</NcActionButton>
							<NcActionButton closeAfterClick @click="removeHistoryState(state.index)">
								<template #icon>
									<NcIconSvgWrapper :path="mdiDelete" />
								</template>
								{{ t('nextkeeweb', 'Delete this version') }}
							</NcActionButton>
						</NcActions>
					</li>
				</ul>
			</section>

			<p class="entry-details__muted entry-details__times">
				{{ t('nextkeeweb', 'Created {created}, modified {modified}', { created: formatDate(details.created), modified: formatDate(details.modified) }) }}
			</p>
		</template>

		<NcEmptyContent v-else :name="t('nextkeeweb', 'Entry not found')" />

		<HistoryVersionDialog
			v-if="historyIndex !== null && entry"
			:entry="entry"
			:index="historyIndex"
			:canRestore="database.writable"
			@restore="restore(historyIndex!)"
			@close="historyIndex = null" />
		<MoveDialog
			v-if="moving && entry"
			:database="database"
			:currentGroup="entry.parentGroup?.uuid.id ?? null"
			@move="move"
			@close="moving = false" />
	</div>
</template>

<script setup lang="ts">
import type { OpenDatabase } from '@/stores/vault'

import { mdiContentDuplicate, mdiDelete, mdiDownload, mdiFolderMove, mdiHistory, mdiPaperclip, mdiPencil, mdiRestore } from '@mdi/js'
import { showConfirmation, showSuccess } from '@nextcloud/dialogs'
import { formatFileSize } from '@nextcloud/files'
import { computed, ref } from 'vue'
import NcActionButton from '@nextcloud/vue/components/NcActionButton'
import NcActions from '@nextcloud/vue/components/NcActions'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcChip from '@nextcloud/vue/components/NcChip'
import NcEmptyContent from '@nextcloud/vue/components/NcEmptyContent'
import NcIconSvgWrapper from '@nextcloud/vue/components/NcIconSvgWrapper'
import NcNoteCard from '@nextcloud/vue/components/NcNoteCard'
import EntryEditor from './EntryEditor.vue'
import EntryIcon from './EntryIcon.vue'
import FieldRow from './FieldRow.vue'
import HistoryVersionDialog from './HistoryVersionDialog.vue'
import MoveDialog from './MoveDialog.vue'
import TotpField from './TotpField.vue'
import { findEntry, findGroup, useDatabaseView } from '@/composables/useDatabase'
import {
	attachmentData,
	createEntry,
	deleteEntry,
	deleteHistory,
	draftFromEntry,
	entryPath,
	getField,
	isExpired,
	isInRecycleBin,
	moveEntry,
	restoreHistory,
	StandardField,
} from '@/core/entries'
import { resolvedField, resolvePlaceholders } from '@/core/placeholders'
import { readTotp } from '@/core/totp'
import { t } from '@/l10n'
import { copySecret } from '@/services/clipboard'
import { downloadBlob } from '@/services/download'
import { useSettingsStore } from '@/stores/settings'
import { useVaultStore } from '@/stores/vault'

const props = defineProps<{
	database: OpenDatabase
	creating: boolean
}>()

const emit = defineEmits<{
	done: []
}>()

const vault = useVaultStore()
const settingsStore = useSettingsStore()
const view = useDatabaseView(() => props.database)
const editing = ref(false)
const moving = ref(false)
const showHistory = ref(false)
const historyIndex = ref<number | null>(null)

const entry = computed(() => view.value ? findEntry(view.value.db, props.database.selectedEntry) : undefined)

/** OTP-related fields are shown as the TOTP row instead. */
const hiddenFields = new Set(['otp', 'TOTP Seed', 'TOTP Settings'])

const details = computed(() => {
	const db = view.value!.db
	const current = entry.value!
	const resolve = (key: string) => resolvedField(db, current, key)
	const draft = draftFromEntry(current)
	return {
		title: getField(current, StandardField.Title),
		path: entryPath(current).join(' › '),
		username: resolve(StandardField.UserName),
		password: resolve(StandardField.Password),
		url: resolve(StandardField.URL),
		notes: getField(current, StandardField.Notes),
		totp: readTotp(current),
		customFields: draft.customFields
			.filter((field) => !hiddenFields.has(field.key))
			.map((field) => ({ ...field, value: resolvePlaceholders(db, current, field.value) })),
		tags: draft.tags,
		expires: draft.expires,
		expired: isExpired(current),
		attachments: draft.attachments.map((attachment) => ({ name: attachment.name, size: attachmentData(attachment).byteLength })),
		history: current.history
			.map((state, index) => ({ index, modified: state.times.lastModTime, summary: getField(state, StandardField.Title) }))
			.reverse(),
		created: current.times.creationTime,
		modified: current.times.lastModTime,
		inRecycleBin: isInRecycleBin(db, current),
	}
})

function formatDate(date: Date | null | undefined): string {
	return date ? date.toLocaleString() : ''
}

function formatSize(bytes: number): string {
	return formatFileSize(bytes)
}

async function copy(value: string, message: string): Promise<void> {
	await copySecret(value, settingsStore.settings.clipboardClearSeconds)
	showSuccess(message)
}

function download(name: string): void {
	const attachment = draftFromEntry(entry.value!).attachments.find((candidate) => candidate.name === name)
	if (!attachment) {
		return
	}
	downloadBlob(name, attachmentData(attachment) as Uint8Array<ArrayBuffer>)
}

function onSaved(id: string): void {
	editing.value = false
	vault.select(props.database.id, { entry: id })
	emit('done')
}

function onCancel(): void {
	editing.value = false
	emit('done')
}

function clone(): void {
	const id = entry.value!.uuid.id
	const created = vault.change(props.database.id, (db) => {
		const source = findEntry(db, id)
		if (!source) {
			return undefined
		}
		const draft = draftFromEntry(source)
		draft.title = t('nextkeeweb', '{title} - Clone', { title: draft.title })
		return createEntry(db, source.parentGroup ?? db.getDefaultGroup(), draft)
	})
	if (created) {
		vault.select(props.database.id, { entry: created.uuid.id })
	}
}

function move(groupId: string): void {
	const id = entry.value!.uuid.id
	vault.change(props.database.id, (db) => {
		const current = findEntry(db, id)
		const target = findGroup(db, groupId)
		if (current && target) {
			moveEntry(db, current, target)
		}
	})
	vault.select(props.database.id, { group: groupId, entry: id })
	moving.value = false
}

async function remove(): Promise<void> {
	const id = entry.value!.uuid.id
	if (details.value.inRecycleBin || !view.value!.db.meta.recycleBinEnabled) {
		const confirmed = await showConfirmation({
			name: t('nextkeeweb', 'Delete permanently'),
			text: t('nextkeeweb', 'Permanently delete "{title}"? This cannot be undone.', { title: details.value.title }),
			labelConfirm: t('nextkeeweb', 'Delete permanently'),
			labelReject: t('nextkeeweb', 'Cancel'),
			severity: 'warning',
		})
		if (!confirmed) {
			return
		}
	}
	vault.change(props.database.id, (db) => {
		const current = findEntry(db, id)
		if (current) {
			deleteEntry(db, current)
		}
	})
	vault.select(props.database.id, { entry: null })
}

function restore(index: number): void {
	const id = entry.value!.uuid.id
	vault.change(props.database.id, (db) => {
		const current = findEntry(db, id)
		if (current?.history[index]) {
			restoreHistory(db, current, index)
		}
	})
	historyIndex.value = null
}

function removeHistoryState(index: number): void {
	const id = entry.value!.uuid.id
	vault.change(props.database.id, (db) => {
		const current = findEntry(db, id)
		if (current?.history[index]) {
			deleteHistory(current, index)
		}
	})
}
</script>

<style scoped>
.entry-details {
	padding: 16px 24px;
	max-width: 900px;
}

.entry-details__header {
	display: flex;
	align-items: center;
	gap: 12px;
	margin-bottom: 16px;
}

.entry-details__icon {
	width: 40px;
	height: 40px;
	flex-shrink: 0;
}

.entry-details__heading {
	flex: 1;
	min-width: 0;
}

.entry-details__heading h2 {
	margin: 0;
	overflow-wrap: anywhere;
}

.entry-details__path,
.entry-details__muted {
	color: var(--color-text-maxcontrast);
}

.entry-details__fields {
	margin-bottom: 16px;
}

.entry-details__tags {
	display: flex;
	flex-wrap: wrap;
	gap: 4px;
	margin-bottom: 16px;
}

.entry-details__section {
	margin-bottom: 16px;
}

.entry-details__notes {
	white-space: pre-wrap;
	overflow-wrap: anywhere;
}

.entry-details__attachment,
.entry-details__history {
	display: flex;
	align-items: center;
	gap: 8px;
}

.entry-details__times {
	margin-top: 24px;
	font-size: 0.9em;
}
</style>
