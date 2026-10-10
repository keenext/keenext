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
					<NcActions v-if="database.writable" variant="secondary" :aria-label="t('keenext', 'More actions')">
						<NcActionButton closeAfterClick @click="clone">
							<template #icon>
								<NcIconSvgWrapper :path="mdiContentDuplicate" />
							</template>
							{{ t('keenext', 'Clone entry') }}
						</NcActionButton>
						<NcActionButton :disabled="!details.url || faviconBusy" closeAfterClick @click="downloadFaviconForEntry">
							<template #icon>
								<NcIconSvgWrapper :path="mdiImageSearchOutline" />
							</template>
							{{ t('keenext', 'Download favicon') }}
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

				<NcRadioGroup
					v-model="tab"
					class="entry-details__tabs"
					:label="t('keenext', 'Entry')"
					hideLabel>
					<NcRadioGroupButton value="details" :label="t('keenext', 'Details')" />
					<NcRadioGroupButton v-if="details.history.length > 0" value="history" :label="t('keenext', 'History ({count})', { count: details.history.length })" />
					<NcRadioGroupButton value="info" :label="t('keenext', 'Info')" />
				</NcRadioGroup>

				<NcNoteCard v-if="details.expired" type="warning">
					{{ t('keenext', 'This entry expired on {date}', { date: formatDate(details.expires) }) }}
				</NcNoteCard>

				<div v-if="tab === 'details'" class="entry-details__column">
					<section class="entry-details__group">
						<h3>{{ t('keenext', 'Entry') }}</h3>
						<dl>
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
							<TotpField
								v-if="details.totp"
								:config="details.totp"
								:uri="details.totpUri"
								@copy="(code) => copy(code, t('keenext', 'TOTP copied'))" />
							<FieldRow
								v-if="details.notes"
								:label="t('keenext', 'Notes')"
								:value="details.notes"
								multiline
								@copy="copy(details.notes, t('keenext', 'Copied'))" />
						</dl>
					</section>

					<section v-if="details.customFields.length > 0" class="entry-details__group">
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

					<section v-if="details.attachments.length > 0" class="entry-details__group">
						<h3>{{ t('keenext', 'Attachments') }}</h3>
						<ul>
							<li v-for="attachment in details.attachments" :key="attachment.name" class="entry-details__attachment">
								<NcIconSvgWrapper :path="mdiPaperclip" :size="20" />
								<span class="entry-details__attachment-name">{{ attachment.name }}</span>
								<span class="entry-details__muted">{{ formatSize(attachment.size) }}</span>
								<IconButton :label="t('keenext', 'Download {name}', { name: attachment.name })" :path="mdiDownload" @click="download(attachment.name)" />
							</li>
						</ul>
					</section>
				</div>

				<div v-else-if="tab === 'history'" class="entry-details__column">
					<section class="entry-details__group">
						<h3>{{ t('keenext', 'History ({count})', { count: details.history.length }) }}</h3>
						<p class="entry-details__muted">
							{{ t('keenext', 'Each version lists the fields that were changed in the next one.') }}
						</p>
						<ul class="entry-details__versions">
							<li class="entry-details__version entry-details__version--current">
								<div class="entry-details__version-main">
									<strong>{{ t('keenext', 'Current version') }}</strong>
									<span class="entry-details__muted">{{ formatDate(details.modified) }}</span>
								</div>
							</li>
							<li v-for="state in details.history" :key="state.index" class="entry-details__version">
								<div class="entry-details__version-main">
									<strong>{{ formatDate(state.modified) }}</strong>
									<span v-if="state.changes.length > 0" class="entry-details__chips">
										<NcChip
											v-for="change in state.changes"
											:key="change"
											:text="change"
											noClose />
									</span>
								</div>
								<div class="entry-details__version-actions">
									<NcButton @click="historyIndex = state.index">
										{{ t('keenext', 'View') }}
									</NcButton>
									<NcButton v-if="database.writable" @click="restore(state.index)">
										<template #icon>
											<NcIconSvgWrapper :path="mdiRestore" />
										</template>
										{{ t('keenext', 'Restore this version') }}
									</NcButton>
									<IconButton
										v-if="database.writable"
										:label="t('keenext', 'Delete this version')"
										:path="mdiDelete"
										@click="removeHistoryState(state.index)" />
								</div>
							</li>
						</ul>
					</section>
				</div>

				<section v-else class="entry-details__group">
					<h3>{{ t('keenext', 'Info') }}</h3>
					<dl class="entry-details__info">
						<div v-for="row in details.info" :key="row.label" class="entry-details__info-row">
							<dt>{{ row.label }}</dt>
							<dd>
								<span>{{ row.value }}</span>
								<IconButton
									v-if="row.copy"
									:label="t('keenext', 'Copy {field}', { field: row.label })"
									:title="t('keenext', 'Copy')"
									:path="mdiContentCopy"
									@click="copy(row.value, t('keenext', 'Copied'))" />
							</dd>
						</div>
					</dl>
				</section>
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
import type { EntryChanges, StandardChange } from '@/core/entries'
import type { OpenDatabase } from '@/stores/vault'

import { mdiClockOutline, mdiContentCopy, mdiContentDuplicate, mdiDelete, mdiDownload, mdiFolderMove, mdiImageSearchOutline, mdiPaperclip, mdiPencil, mdiRestore } from '@mdi/js'
import { showConfirmation, showError, showSuccess } from '@nextcloud/dialogs'
import { formatFileSize } from '@nextcloud/files'
import { computed, ref } from 'vue'
import NcActionButton from '@nextcloud/vue/components/NcActionButton'
import NcActions from '@nextcloud/vue/components/NcActions'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcChip from '@nextcloud/vue/components/NcChip'
import NcEmptyContent from '@nextcloud/vue/components/NcEmptyContent'
import NcIconSvgWrapper from '@nextcloud/vue/components/NcIconSvgWrapper'
import NcNoteCard from '@nextcloud/vue/components/NcNoteCard'
import NcRadioGroup from '@nextcloud/vue/components/NcRadioGroup'
import NcRadioGroupButton from '@nextcloud/vue/components/NcRadioGroupButton'
import EntryEditor from './EntryEditor.vue'
import EntryIcon from './EntryIcon.vue'
import FieldRow from './FieldRow.vue'
import HistoryVersionDialog from './HistoryVersionDialog.vue'
import IconButton from './IconButton.vue'
import MoveDialog from './MoveDialog.vue'
import TotpField from './TotpField.vue'
import { findEntry, findGroup, useDatabaseView } from '@/composables/useDatabase'
import {
	applyDraft,
	attachmentData,
	changedFields,
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
import { iconFor, storeIcon } from '@/core/favicons'
import { resolvedField, resolvePlaceholders } from '@/core/placeholders'
import { entryOtpUri, readTotp } from '@/core/totp'
import { t } from '@/l10n'
import { copySecret } from '@/services/clipboard'
import { downloadBlob } from '@/services/download'
import { downloadFavicon } from '@/services/favicon'
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
const tab = ref<'details' | 'history' | 'info'>('details')
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
			.map((state, index) => ({
				index,
				modified: state.times.lastModTime,
				changes: changeLabels(changedFields(draftFromEntry(state), draftFromEntry(current.history[index + 1] ?? current))),
			}))
			.reverse(),
		modified: current.times.lastModTime,
		info: [
			{ label: t('keenext', 'Group'), value: entryPath(current).join(' › '), copy: false },
			{ label: t('keenext', 'Created'), value: formatDate(current.times.creationTime), copy: false },
			{ label: t('keenext', 'Modified'), value: formatDate(current.times.lastModTime), copy: false },
			...(current.times.lastAccessTime ? [{ label: t('keenext', 'Last accessed'), value: formatDate(current.times.lastAccessTime), copy: false }] : []),
			...(current.times.usageCount ? [{ label: t('keenext', 'Times opened'), value: String(current.times.usageCount), copy: false }] : []),
			{ label: t('keenext', 'Expires'), value: draft.expires ? formatDate(draft.expires) : t('keenext', 'No expiry date'), copy: false },
			{ label: t('keenext', 'Attachments'), value: draft.attachments.length > 0 ? `${draft.attachments.length} (${formatSize(draft.attachments.reduce((sum, attachment) => sum + attachmentData(attachment).byteLength, 0))})` : '0', copy: false },
			{ label: t('keenext', 'Entry ID'), value: uuidHex(current.uuid.id), copy: true },
		],
		inRecycleBin: isInRecycleBin(db, current),
	}
})

/** KeePass shows entry ids as 32 hex digits; kdbxweb keeps them base64. */
function uuidHex(base64: string): string {
	return [...atob(base64)].map((char) => char.charCodeAt(0).toString(16).padStart(2, '0')).join('')
}

/** Names of changed fields as shown on the history chips. */
function changeLabels(changes: EntryChanges): string[] {
	const names: Record<StandardChange, string> = {
		title: t('keenext', 'Title'),
		username: t('keenext', 'Username'),
		password: t('keenext', 'Password'),
		url: t('keenext', 'URL'),
		notes: t('keenext', 'Notes'),
		tags: t('keenext', 'Tags'),
		expires: t('keenext', 'Expires'),
		attachments: t('keenext', 'Attachments'),
		icon: t('keenext', 'Icon'),
	}
	// The one-time password is stored in several attributes but is one thing to the user.
	const custom = changes.custom.map((key) => hiddenFields.has(key) ? t('keenext', 'TOTP') : key)
	return [...changes.standard.map((change) => names[change]), ...new Set(custom)]
}

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

const faviconBusy = ref(false)

async function downloadFaviconForEntry(): Promise<void> {
	const id = entry.value!.uuid.id
	faviconBusy.value = true
	try {
		const icon = iconFor(view.value!.db, await downloadFavicon(details.value.url))
		vault.change(props.database.id, (db) => {
			const current = findEntry(db, id)
			if (current) {
				storeIcon(db, icon)
				applyDraft(db, current, { ...draftFromEntry(current), customIcon: icon.id })
			}
		})
		showSuccess(t('keenext', 'Favicon downloaded'))
	} catch {
		showError(t('keenext', 'Could not find a favicon for this address'))
	} finally {
		faviconBusy.value = false
	}
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
/* Spacing scale shared with the editor. NcTextField already adds 6px above each box for its label. */
.entry-details {
	--entry-details-padding-x: 32px;
	--entry-gap: 20px;
	--entry-card-padding: 20px;
	--entry-field-gap: 18px;
	height: 100%;
	overflow-y: auto;
	padding: 0 var(--entry-details-padding-x);
	box-sizing: border-box;
}

/* One column; on wide screens it stays readable in the middle instead of stretching. */
.entry-details__body {
	max-width: 900px;
	margin-inline: auto;
	/* Not on the scrolling pane: the editor's action bar sticks to the top edge of that pane. */
	padding-block: 16px 24px;
}

@media (max-width: 1024px) {
	.entry-details {
		--entry-details-padding-x: 16px;
		--entry-gap: 16px;
		--entry-card-padding: 16px;
		/* The back button above takes one row of the pane. */
		height: calc(100% - var(--default-clickable-area));
	}

	.entry-details__body {
		padding-block: 8px 24px;
	}
}

.entry-details__header {
	display: flex;
	align-items: flex-start;
	gap: 12px;
	margin-bottom: var(--entry-gap);
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

.entry-details__tabs {
	margin-bottom: var(--entry-gap);
}

.entry-details__column {
	display: flex;
	flex-direction: column;
	gap: var(--entry-gap);
	min-width: 0;
}

/* A group is a card with a bold heading over its rows, divided by hairlines, like the cards of the editor. */
.entry-details__group {
	min-width: 0;
	padding: 16px var(--entry-card-padding);
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius-large);
}

.entry-details__group h3 {
	margin: 0 0 8px;
	font-size: 1em;
	font-weight: bold;
}

.entry-details__group dl {
	margin: 0;
	padding: 0;
}

.entry-details__group ul {
	display: flex;
	flex-direction: column;
}

.entry-details__attachment {
	display: flex;
	align-items: center;
	gap: 8px;
}

.entry-details__attachment-name {
	flex: 1;
	min-width: 0;
	overflow-wrap: anywhere;
}

.entry-details__versions {
	margin: 8px 0 0;
	padding: 0;
	list-style: none;
}

.entry-details__version {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px 16px;
	padding-block: 12px;
	border-top: 1px solid var(--color-border);
}

.entry-details__version--current strong {
	color: var(--color-primary-element);
}

.entry-details__version-main {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-width: 0;
}

.entry-details__version-main .entry-details__chips {
	margin-top: 0;
}

.entry-details__version-actions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

/* Nextcloud styles bare dt/dd as a right-aligned label column with padding. */
.entry-details__info {
	margin: 0;
	padding: 0;
}

.entry-details__info-row {
	display: grid;
	grid-template-columns: minmax(8rem, max-content) 1fr;
	align-items: center;
	gap: 4px 16px;
	padding-block: 6px;
	border-bottom: 1px solid var(--color-border);
}

.entry-details__info-row:last-child {
	border-bottom: 0;
}

.entry-details__info-row dt {
	display: block;
	width: auto;
	padding: 0;
	text-align: start;
	color: var(--color-text-maxcontrast);
}

.entry-details__info-row dd {
	display: flex;
	align-items: center;
	gap: 8px;
	min-height: var(--default-clickable-area);
	margin: 0;
	padding: 0;
	overflow-wrap: anywhere;
}

.entry-details__info-row dd span {
	flex: 1;
	min-width: 0;
}

@media (max-width: 560px) {
	.entry-details__info-row {
		grid-template-columns: 1fr;
	}
}
</style>
