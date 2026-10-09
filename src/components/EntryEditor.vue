<template>
	<form class="entry-editor" @submit.prevent="save">
		<header class="entry-editor__bar">
			<h2>{{ entry ? t('keenext', 'Edit entry') : t('keenext', 'New entry') }}</h2>
			<NcButton @click="emit('cancel')">
				{{ t('keenext', 'Cancel') }}
			</NcButton>
			<NcButton type="submit" variant="primary" :disabled="!valid">
				<template #icon>
					<NcIconSvgWrapper :path="mdiCheck" />
				</template>
				{{ t('keenext', 'Save') }}
			</NcButton>
		</header>

		<section class="entry-editor__card">
			<div class="entry-editor__row">
				<IconButton :label="t('keenext', 'Choose icon')" @click="iconOpen = true">
					<img
						v-if="pendingIcon && draft.customIcon === pendingIcon.id"
						:src="pendingIcon.url"
						alt=""
						class="entry-editor__pending-icon">
					<EntryIcon
						v-else-if="view"
						:db="view.db"
						:icon="draft.icon"
						:customIcon="draft.customIcon" />
				</IconButton>
				<NcTextField v-model="draft.title" :label="t('keenext', 'Title')" autofocus />
			</div>
			<NcTextField v-model="draft.username" :label="t('keenext', 'Username')" autocomplete="off" />
			<div class="entry-editor__row">
				<NcPasswordField
					v-model="draft.password"
					:label="t('keenext', 'Password')"
					autocomplete="new-password"
					:checkPasswordStrength="false" />
				<IconButton :label="t('keenext', 'Generate password')" :path="mdiDiceMultiple" @click="generatorOpen = true" />
			</div>
			<StrengthMeter v-if="draft.password" :password="draft.password" />
			<div class="entry-editor__row">
				<NcTextField v-model="draft.url" :label="t('keenext', 'URL')" type="url" />
				<IconButton
					:label="t('keenext', 'Download favicon')"
					:title="t('keenext', 'Download favicon (your Nextcloud server fetches it from the website)')"
					:disabled="!draft.url.trim() || faviconBusy"
					@click="downloadFaviconForUrl">
					<NcLoadingIcon v-if="faviconBusy" :size="20" />
					<NcIconSvgWrapper v-else :path="mdiImageSearchOutline" />
				</IconButton>
			</div>
		</section>

		<section class="entry-editor__card">
			<NcSelect
				v-model="draft.tags"
				:options="knownTags"
				:inputLabel="t('keenext', 'Tags')"
				multiple
				taggable
				keepOpen />
		</section>

		<section class="entry-editor__card">
			<NcCheckboxRadioSwitch :modelValue="draft.expires !== null" @update:modelValue="toggleExpiry">
				{{ t('keenext', 'Expires') }}
			</NcCheckboxRadioSwitch>
			<NcDateTimePickerNative
				v-if="draft.expires !== null"
				v-model="draft.expires"
				type="datetime-local"
				:label="t('keenext', 'Expiry date')" />
		</section>

		<section class="entry-editor__card">
			<NcTextArea
				v-model="draft.notes"
				:label="t('keenext', 'Notes')"
				resize="vertical"
				rows="4" />
		</section>

		<section class="entry-editor__card">
			<div class="entry-editor__head">
				<h3>{{ t('keenext', 'Additional attributes') }}</h3>
				<NcButton @click="draft.customFields.push({ key: '', value: '', protected: false })">
					<template #icon>
						<NcIconSvgWrapper :path="mdiPlus" />
					</template>
					{{ t('keenext', 'Add attribute') }}
				</NcButton>
				<NcButton @click="totpOpen = true">
					<template #icon>
						<NcIconSvgWrapper :path="mdiTimerOutline" />
					</template>
					{{ hasTotp ? t('keenext', 'Change TOTP') : t('keenext', 'Set up TOTP') }}
				</NcButton>
			</div>
			<!-- The otp field is edited through the TOTP dialog. -->
			<div
				v-for="(field, index) in draft.customFields"
				v-show="field.key !== OTP_FIELD"
				:key="index"
				class="entry-editor__custom-field">
				<NcTextField
					v-model="field.key"
					class="entry-editor__custom-name"
					:label="t('keenext', 'Name')"
					:error="fieldErrors[index] !== undefined"
					:helperText="fieldErrors[index]" />
				<NcPasswordField
					v-if="field.protected"
					v-model="field.value"
					class="entry-editor__custom-value"
					:label="t('keenext', 'Value')"
					:checkPasswordStrength="false" />
				<NcTextArea
					v-else
					v-model="field.value"
					class="entry-editor__custom-value entry-editor__custom-value--text"
					:label="t('keenext', 'Value')"
					resize="vertical"
					rows="1" />
				<IconButton
					:label="t('keenext', 'Protect value')"
					:title="t('keenext', 'Protect value (hide and encrypt in memory)')"
					:path="field.protected ? mdiLock : mdiLockOpenVariant"
					:pressed="field.protected"
					@click="field.protected = !field.protected" />
				<IconButton :label="t('keenext', 'Remove attribute')" :path="mdiDelete" @click="draft.customFields.splice(index, 1)" />
			</div>
		</section>

		<section class="entry-editor__card">
			<div class="entry-editor__head">
				<h3>{{ t('keenext', 'Attachments') }}</h3>
				<NcButton @click="fileInput?.click()">
					<template #icon>
						<NcIconSvgWrapper :path="mdiPaperclip" />
					</template>
					{{ t('keenext', 'Add attachment') }}
				</NcButton>
			</div>
			<ul v-if="draft.attachments.length > 0">
				<li v-for="(attachment, index) in draft.attachments" :key="attachment.name" class="entry-editor__attachment">
					<NcIconSvgWrapper :path="mdiPaperclip" :size="20" />
					<span class="entry-editor__attachment-name">{{ attachment.name }}</span>
					<IconButton :label="t('keenext', 'Remove {name}', { name: attachment.name })" :path="mdiDelete" @click="draft.attachments.splice(index, 1)" />
				</li>
			</ul>
			<input
				ref="fileInput"
				type="file"
				multiple
				hidden
				@change="addAttachments">
		</section>

		<IconPickerDialog
			v-if="iconOpen"
			:database="database"
			:icon="draft.icon"
			:customIcon="draft.customIcon"
			@select="selectIcon"
			@close="iconOpen = false" />
		<PasswordGeneratorDialog
			v-if="generatorOpen"
			@apply="(password) => { draft.password = password; generatorOpen = false }"
			@close="generatorOpen = false" />
		<TotpSetupDialog
			v-if="totpOpen"
			:current="otpField?.value ?? ''"
			:label="draft.username || draft.title"
			:issuer="draft.title"
			@apply="setTotp"
			@close="totpOpen = false" />
	</form>
</template>

<script setup lang="ts">
import type { KdbxEntry } from 'kdbxweb'
import type { EntryDraft } from '@/core/entries'
import type { OpenDatabase } from '@/stores/vault'

import { mdiCheck, mdiDelete, mdiDiceMultiple, mdiImageSearchOutline, mdiLock, mdiLockOpenVariant, mdiPaperclip, mdiPlus, mdiTimerOutline } from '@mdi/js'
import { showError, showSuccess } from '@nextcloud/dialogs'
import { computed, markRaw, onBeforeUnmount, reactive, ref, toRaw } from 'vue'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcCheckboxRadioSwitch from '@nextcloud/vue/components/NcCheckboxRadioSwitch'
import NcDateTimePickerNative from '@nextcloud/vue/components/NcDateTimePickerNative'
import NcIconSvgWrapper from '@nextcloud/vue/components/NcIconSvgWrapper'
import NcLoadingIcon from '@nextcloud/vue/components/NcLoadingIcon'
import NcPasswordField from '@nextcloud/vue/components/NcPasswordField'
import NcSelect from '@nextcloud/vue/components/NcSelect'
import NcTextArea from '@nextcloud/vue/components/NcTextArea'
import NcTextField from '@nextcloud/vue/components/NcTextField'
import EntryIcon from './EntryIcon.vue'
import IconButton from './IconButton.vue'
import IconPickerDialog from './IconPickerDialog.vue'
import PasswordGeneratorDialog from './PasswordGeneratorDialog.vue'
import StrengthMeter from './StrengthMeter.vue'
import TotpSetupDialog from './TotpSetupDialog.vue'
import { findEntry, findGroup, useDatabaseView } from '@/composables/useDatabase'
import { applyDraft, attachFile, createEntry, draftFromEntry, emptyDraft, isStandardField } from '@/core/entries'
import { iconFor, storeIcon } from '@/core/favicons'
import { OTP_FIELD } from '@/core/totp'
import { t } from '@/l10n'
import { downloadFavicon } from '@/services/favicon'
import { useVaultStore } from '@/stores/vault'

const props = defineProps<{
	database: OpenDatabase
	/** null creates a new entry in the selected group. */
	entry: KdbxEntry | null
}>()

const emit = defineEmits<{
	saved: [id: string]
	cancel: []
}>()

const vault = useVaultStore()
const view = useDatabaseView(() => props.database)
const generatorOpen = ref(false)
const iconOpen = ref(false)
const totpOpen = ref(false)
const fileInput = ref<HTMLInputElement>()

function initialDraft(): EntryDraft {
	const source = props.entry ? draftFromEntry(props.entry) : emptyDraft(view.value?.db.meta.defaultUser ?? '')
	// Attachment values are handles into kdbxweb's binary pool and must stay unproxied.
	source.attachments = source.attachments.map((attachment) => ({ name: attachment.name, value: markRaw(attachment.value) }))
	return source
}

const draft = reactive(initialDraft())

const knownTags = computed(() => {
	const tags = new Set<string>()
	for (const entry of view.value?.db.getDefaultGroup().allEntries() ?? []) {
		entry.tags.forEach((tag) => tags.add(tag))
	}
	return [...tags].sort()
})

const otpField = computed(() => draft.customFields.find((field) => field.key === OTP_FIELD))
const hasTotp = computed(() => otpField.value !== undefined && otpField.value.value !== '')

const fieldErrors = computed(() => {
	const errors: Record<number, string> = {}
	const seen = new Set<string>()
	draft.customFields.forEach((field, index) => {
		if (field.key.trim() === '') {
			errors[index] = t('keenext', 'Name is required')
		} else if (isStandardField(field.key)) {
			errors[index] = t('keenext', 'This name is reserved')
		} else if (seen.has(field.key)) {
			errors[index] = t('keenext', 'Name already used')
		}
		seen.add(field.key)
	})
	return errors
})

const valid = computed(() => Object.keys(fieldErrors.value).length === 0)

/** A downloaded icon is only written to the database when the entry is saved. */
const pendingIcon = ref<{ id: string, data: Uint8Array, url: string } | null>(null)
const faviconBusy = ref(false)

onBeforeUnmount(() => {
	if (pendingIcon.value) {
		URL.revokeObjectURL(pendingIcon.value.url)
	}
})

async function downloadFaviconForUrl(): Promise<void> {
	const db = view.value?.db
	if (!db) {
		return
	}
	faviconBusy.value = true
	try {
		const icon = iconFor(db, await downloadFavicon(draft.url.trim()))
		if (pendingIcon.value) {
			URL.revokeObjectURL(pendingIcon.value.url)
		}
		pendingIcon.value = db.meta.customIcons.has(icon.id)
			? null
			: { ...icon, url: URL.createObjectURL(new Blob([icon.data as Uint8Array<ArrayBuffer>], { type: 'image/png' })) }
		draft.customIcon = icon.id
		showSuccess(t('keenext', 'Favicon downloaded'))
	} catch {
		showError(t('keenext', 'Could not find a favicon for this address'))
	} finally {
		faviconBusy.value = false
	}
}

function selectIcon(value: { icon: number, customIcon: string | null }): void {
	draft.icon = value.icon
	draft.customIcon = value.customIcon
	iconOpen.value = false
}

function toggleExpiry(enabled: boolean): void {
	const nextMonth = new Date()
	nextMonth.setMonth(nextMonth.getMonth() + 1)
	draft.expires = enabled ? nextMonth : null
}

function setTotp(uri: string): void {
	const remaining = draft.customFields.filter((field) => field.key !== OTP_FIELD)
	draft.customFields = uri ? [...remaining, { key: OTP_FIELD, value: uri, protected: true }] : remaining
	totpOpen.value = false
}

async function addAttachments(event: Event): Promise<void> {
	const input = event.target as HTMLInputElement
	const db = view.value?.db
	if (!db || !input.files) {
		return
	}
	for (const file of input.files) {
		await attachFile(db, draft, file.name, new Uint8Array(await file.arrayBuffer()))
	}
	draft.attachments = draft.attachments.map((attachment) => ({ name: attachment.name, value: markRaw(toRaw(attachment.value)) }))
	input.value = ''
}

/** Plain copy without Vue proxies; kdbxweb must only ever see raw objects. */
function plainDraft(): EntryDraft {
	const raw = toRaw(draft)
	return {
		...raw,
		tags: [...raw.tags],
		expires: raw.expires ? new Date(raw.expires) : null,
		customFields: raw.customFields.map((field) => ({ ...toRaw(field), key: field.key.trim() })),
		attachments: raw.attachments.map((attachment) => ({ name: attachment.name, value: toRaw(attachment.value) })),
	}
}

function save(): void {
	if (!valid.value) {
		return
	}
	const values = plainDraft()
	const id = props.entry?.uuid.id
	const saved = vault.change(props.database.id, (db) => {
		if (pendingIcon.value && values.customIcon === pendingIcon.value.id) {
			storeIcon(db, pendingIcon.value)
		}
		const existing = id ? findEntry(db, id) : undefined
		if (existing) {
			applyDraft(db, existing, values)
			return existing
		}
		// New, or deleted elsewhere while being edited: keep the edit as a new entry.
		const group = findGroup(db, props.database.selectedGroup) ?? db.getDefaultGroup()
		return createEntry(db, group, values)
	})
	emit('saved', saved.uuid.id)
}
</script>

<style scoped>
/* The pane's width, not the window's, decides the layout: the editor sits next to the list on
   desktop and fills the screen on a phone. */
.entry-editor {
	container-type: inline-size;
	display: flex;
	flex-direction: column;
	gap: var(--entry-gap, 20px);
}

/* Stays at the top of the scrolling pane so saving never needs a scroll. */
.entry-editor__bar {
	position: sticky;
	top: 0;
	z-index: 20;
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 12px 0;
	border-bottom: 1px solid var(--color-border);
	background: var(--color-main-background);
}

.entry-editor__bar h2 {
	flex: 1;
	min-width: 0;
	margin: 0;
	font-size: 1.25rem;
	overflow-wrap: anywhere;
}

.entry-editor__card {
	display: flex;
	flex-direction: column;
	gap: var(--entry-field-gap, 12px);
	padding: var(--entry-card-padding, 20px);
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius-large);
}

.entry-editor__head {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	margin-bottom: 4px;
}

.entry-editor__head h3 {
	flex: 1;
	min-width: 8ch;
	margin: 0;
	font-size: 1em;
	font-weight: bold;
}

/* Fields keep room for their floating label above the box, so buttons line up with the bottom edge. */
.entry-editor__row {
	display: flex;
	align-items: flex-end;
	gap: 12px;
}

.entry-editor__row > :first-child:not(.icon-button),
.entry-editor__row > :nth-child(2):not(.icon-button) {
	flex: 1;
	min-width: 0;
}

.entry-editor__pending-icon {
	width: 24px;
	height: 24px;
}

.entry-editor__custom-field {
	display: grid;
	grid-template-columns: minmax(0, 1fr) minmax(0, 2fr) auto auto;
	align-items: end;
	gap: 12px;
}

/* One line like the name field next to it; grows when the value has several lines. */
.entry-editor__custom-value--text :deep(.textarea__input) {
	display: block;
	field-sizing: content;
	min-height: calc(var(--default-clickable-area) - 4px);
	padding-block: 4px;
	line-height: 22px;
	box-sizing: border-box;
}

@container (max-width: 560px) {
	.entry-editor__head h3 {
		flex-basis: 100%;
	}

	.entry-editor__custom-field {
		grid-template-columns: minmax(0, 1fr) auto auto;
		padding-bottom: 8px;
		border-bottom: 1px solid var(--color-border);
	}

	.entry-editor__custom-name {
		grid-column: 1 / -1;
	}
}

.entry-editor__attachment {
	display: flex;
	align-items: center;
	gap: 8px;
}

.entry-editor__attachment-name {
	flex: 1;
	min-width: 0;
	overflow-wrap: anywhere;
}
</style>
