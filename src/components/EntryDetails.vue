<template>
	<div class="entry-details">
		<div class="entry-details__body">
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
						<h2>{{ details.title || t('keenext', '(no title)') }}</h2>
						<p class="entry-details__path">
							{{ details.path }}
						</p>
						<div v-if="details.tags.length > 0 || details.expires" class="entry-details__chips">
							<NcChip
								v-for="tag in details.tags"
								:key="tag"
								:text="tag"
								noClose />
							<NcChip
								v-if="details.expires"
								:text="`${t('keenext', 'Expires')}: ${formatDay(details.expires)}`"
								:iconPath="mdiClockOutline"
								:variant="details.expired ? 'error' : 'tertiary'"
								noClose />
						</div>
					</div>
					<NcButton v-if="database.writable" variant="primary" @click="editing = true">
						<template #icon>
							<NcIconSvgWrapper :path="mdiPencil" />
						</template>
						{{ t('keenext', 'Edit') }}
					</NcButton>
					<NcActions v-if="database.writable" :aria-label="t('keenext', 'More actions')">
						<NcActionButton closeAfterClick @click="clone">
							<template #icon>
								<NcIconSvgWrapper :path="mdiContentDuplicate" />
							</template>
							{{ t('keenext', 'Clone entry') }}
						</NcActionButton>
						<NcActionButton closeAfterClick @click="moving = true">
							<template #icon>
								<NcIconSvgWrapper :path="mdiFolderMove" />
							</template>
							{{ t('keenext', 'Move to group') }}
						</NcActionButton>
						<NcActionButton closeAfterClick @click="remove">
							<template #icon>
								<NcIconSvgWrapper :path="mdiDelete" />
							</template>
							{{ details.inRecycleBin ? t('keenext', 'Delete permanently') : t('keenext', 'Delete') }}
						</NcActionButton>
					</NcActions>
				</header>

				<NcNoteCard v-if="details.expired" type="warning">
					{{ t('keenext', 'This entry expired on {date}', { date: formatDate(details.expires) }) }}
				</NcNoteCard>

				<div class="entry-details__grid">
					<div class="entry-details__column">
						<dl class="entry-details__card">
							<FieldRow :label="t('keenext', 'Username')" :value="details.username" @copy="copy(details.username, t('keenext', 'Username copied'))" />
							<FieldRow
								:label="t('keenext', 'Password')"
								:value="details.password"
								secret
								@copy="copy(details.password, t('keenext', 'Password copied'))" />
							<FieldRow
								:label="t('keenext', 'URL')"
								:value="details.url"
								link
								@copy="copy(details.url, t('keenext', 'URL copied'))" />
						</dl>

						<dl v-if="details.totp" class="entry-details__card entry-details__card--totp">
							<TotpField
								:config="details.totp"
								:uri="details.totpUri"
								@copy="(code) => copy(code, t('keenext', 'TOTP copied'))" />
						</dl>

						<section v-if="details.customFields.length > 0" class="entry-details__card">
							<h3>{{ t('keenext', 'Additional attributes') }}</h3>
							<dl>
								<FieldRow
									v-for="field in details.customFields"
									:key="field.key"
									:label="field.key"
									:value="field.value"
									:secret="field.protected"
									:multiline="field.value.includes('\n')"
									@copy="copy(field.value, t('keenext', '{field} copied', { field: field.key }))" />
							</dl>
						</section>
					</div>

					<div v-if="details.notes || details.attachments.length > 0" class="entry-details__column">
						<section v-if="details.notes" class="entry-details__card">
							<h3>{{ t('keenext', 'Notes') }}</h3>
							<p class="entry-details__notes">
								{{ details.notes }}
							</p>
						</section>

						<section v-if="details.attachments.length > 0" class="entry-details__card">
							<h3>{{ t('keenext', 'Attachments') }}</h3>
							<ul>
								<li v-for="attachment in details.attachments" :key="attachment.name" class="entry-details__attachment">
									<NcIconSvgWrapper :path="mdiPaperclip" :size="20" />
									<span class="entry-details__attachment-name">{{ attachment.name }}</span>
									<span class="entry-details__muted">{{ formatSize(attachment.size) }}</span>
									<NcButton variant="tertiary" :aria-label="t('keenext', 'Download {name}', { name: attachment.name })" @click="download(attachment.name)">
										<template #icon>
											<NcIconSvgWrapper :path="mdiDownload" />
										</template>
									</NcButton>
								</li>
							</ul>
						</section>
					</div>
				</div>

				<footer class="entry-details__meta">
					<p>
						{{ t('keenext', 'Created {created}, modified {modified}', { created: formatDate(details.created), modified: formatDate(details.modified) }) }}
					</p>
					<NcButton
						v-if="details.history.length > 0"
						variant="tertiary"
						:aria-expanded="showHistory"
						@click="showHistory = !showHistory">
						<template #icon>
							<NcIconSvgWrapper :path="mdiHistory" />
						</template>
						{{ t('keenext', 'History ({count})', { count: details.history.length }) }}
					</NcButton>
					<ul v-if="showHistory" class="entry-details__history-list">
						<li v-for="state in details.history" :key="state.index" class="entry-details__history">
							<NcButton variant="tertiary" @click="historyIndex = state.index">
								{{ formatDate(state.modified) }}
							</NcButton>
							<span class="entry-details__muted">{{ state.summary }}</span>
							<NcActions v-if="database.writable" :aria-label="t('keenext', 'History actions')">
								<NcActionButton closeAfterClick @click="restore(state.index)">
									<template #icon>
										<NcIconSvgWrapper :path="mdiRestore" />
									</template>
									{{ t('keenext', 'Restore this version') }}
								</NcActionButton>
								<NcActionButton closeAfterClick @click="removeHistoryState(state.index)">
									<template #icon>
										<NcIconSvgWrapper :path="mdiDelete" />
									</template>
									{{ t('keenext', 'Delete this version') }}
								</NcActionButton>
							</NcActions>
						</li>
					</ul>
				</footer>
			</template>

			<NcEmptyContent v-else :name="t('keenext', 'Entry not found')" />
		</div>

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

import { mdiClockOutline, mdiContentDuplicate, mdiDelete, mdiDownload, mdiFolderMove, mdiHistory, mdiPaperclip, mdiPencil, mdiRestore } from '@mdi/js'
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
import { entryOtpUri, readTotp } from '@/core/totp'
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
		totpUri: entryOtpUri(current),
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

function formatDay(date: Date | null | undefined): string {
	return date ? date.toLocaleDateString() : ''
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
		draft.title = t('keenext', '{title} - Clone', { title: draft.title })
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
			name: t('keenext', 'Delete permanently'),
			text: t('keenext', 'Permanently delete "{title}"? This cannot be undone.', { title: details.value.title }),
			labelConfirm: t('keenext', 'Delete permanently'),
			labelReject: t('keenext', 'Cancel'),
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
/* Scrolls itself: on narrow screens Nextcloud shows the details without a scrolling container. */
.entry-details {
	--entry-details-padding-x: 24px;
	height: 100%;
	overflow-y: auto;
	padding: 16px var(--entry-details-padding-x);
	box-sizing: border-box;
}

.entry-details__body {
	max-width: 1200px;
}

@media (max-width: 1024px) {
	.entry-details {
		--entry-details-padding-x: 16px;
		/* The back button above takes one row of the pane. */
		height: calc(100% - var(--default-clickable-area));
		padding-block: 8px 24px;
	}
}

.entry-details__header {
	display: flex;
	align-items: flex-start;
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

.entry-details__path {
	margin: 0;
}

.entry-details__chips {
	display: flex;
	flex-wrap: wrap;
	gap: 4px;
	margin-top: 8px;
}

/* One column on narrow panes, two where the pane has room for both. */
.entry-details__grid {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(min(100%, 400px), 1fr));
	gap: 16px;
	align-items: start;
}

.entry-details__column {
	display: flex;
	flex-direction: column;
	gap: 16px;
	min-width: 0;
}

.entry-details__card {
	margin: 0;
	padding: 4px 16px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius-large);
}

section.entry-details__card {
	padding-block: 12px;
}

.entry-details__card--totp {
	border-color: transparent;
	background: var(--color-primary-element-light);
}

.entry-details__card h3 {
	margin: 0 0 4px;
	font-size: 1em;
	font-weight: bold;
}

.entry-details__card dl {
	margin: 0;
	padding: 0;
}

.entry-details__card ul {
	display: flex;
	flex-direction: column;
}

.entry-details__notes {
	margin: 0;
	white-space: pre-wrap;
	overflow-wrap: anywhere;
}

.entry-details__attachment,
.entry-details__history {
	display: flex;
	align-items: center;
	gap: 8px;
}

.entry-details__attachment-name {
	flex: 1;
	min-width: 0;
	overflow-wrap: anywhere;
}

.entry-details__meta {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 4px 16px;
	margin-top: 24px;
	padding-top: 8px;
	border-top: 1px solid var(--color-border);
	color: var(--color-text-maxcontrast);
	font-size: var(--font-size-small, 13px);
}

.entry-details__meta p {
	margin: 0;
}

.entry-details__history-list {
	flex-basis: 100%;
}
</style>
