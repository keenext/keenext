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

		<div class="entry-editor__group">
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
				<TextInput v-model="draft.title" :label="t('keenext', 'Title')" autofocus />
			</div>
			<TextInput v-model="draft.username" :label="t('keenext', 'Username')" autocomplete="off" />
			<div class="entry-editor__password">
				<div class="entry-editor__row">
					<PasswordInput v-model="draft.password" :label="t('keenext', 'Password')" autocomplete="new-password" />
					<IconButton :label="t('keenext', 'Generate password')" :path="mdiDiceMultiple" @click="generatorOpen = true" />
				</div>
				<StrengthMeter v-if="draft.password" :password="draft.password" />
			</div>
			<div class="entry-editor__row">
				<TextInput v-model="draft.url" :label="t('keenext', 'URL')" type="url" />
				<IconButton
					:label="t('keenext', 'Download favicon')"
					:title="t('keenext', 'Download favicon (your Nextcloud server fetches it from the website)')"
					:disabled="!draft.url.trim() || faviconBusy"
					@click="downloadFaviconForUrl">
					<NcLoadingIcon v-if="faviconBusy" :size="20" />
					<NcIconSvgWrapper v-else :path="mdiImageSearchOutline" />
				</IconButton>
			</div>
			<FormField :label="t('keenext', 'TOTP')">
				<div>
					<NcButton @click="totpOpen = true">
						<template #icon>
							<NcIconSvgWrapper :path="mdiTimerOutline" />
						</template>
						{{ hasTotp ? t('keenext', 'Change TOTP') : t('keenext', 'Set up TOTP') }}
					</NcButton>
				</div>
			</FormField>
			<TextAreaInput
				v-model="draft.notes"
				:label="t('keenext', 'Notes')"
				resize="vertical"
				rows="4" />
			<FormField v-slot="{ id }" :label="t('keenext', 'Tags')">
				<NcSelect
					v-model="draft.tags"
					:inputId="id"
					:options="knownTags"
					:inputLabel="t('keenext', 'Tags')"
					labelOutside
					multiple
					taggable
					keepOpen />
			</FormField>
			<div class="entry-editor__expiry">
				<NcCheckboxRadioSwitch :modelValue="draft.expires !== null" @update:modelValue="toggleExpiry">
					{{ t('keenext', 'Expires') }}
				</NcCheckboxRadioSwitch>
				<FormField v-if="draft.expires !== null" v-slot="{ id }" :label="t('keenext', 'Expiry date')">
					<NcDateTimePickerNative
						:id="id"
						v-model="draft.expires"
						type="datetime-local"
						:label="t('keenext', 'Expiry date')"
						hideLabel />
				</FormField>
			</div>
		</div>

		<FormSection>
			<template #label>
				<span class="entry-editor__head">
					<span>{{ t('keenext', 'Additional attributes') }}</span>
					<NcButton @click="draft.customFields.push({ key: '', value: '', protected: false })">
						<template #icon>
							<NcIconSvgWrapper :path="mdiPlus" />
						</template>
						{{ t('keenext', 'Add attribute') }}
					</NcButton>
				</span>
			</template>
			<!-- The otp field is edited through the TOTP dialog. -->
			<div
				v-for="(field, index) in draft.customFields"
				v-show="field.key !== OTP_FIELD"
				:key="index"
				class="entry-editor__custom-field">
				<TextInput
					v-model="field.key"
					class="entry-editor__custom-name"
					:label="t('keenext', 'Name')"
					:error="fieldErrors[index] !== undefined"
					:helperText="fieldErrors[index]" />
				<PasswordInput
					v-if="field.protected"
					v-model="field.value"
					class="entry-editor__custom-value"
					:label="t('keenext', 'Value')" />
				<TextAreaInput
					v-else
					v-model="field.value"
					class="entry-editor__custom-value entry-editor__custom-text"
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
		</FormSection>

		<FormSection>
			<template #label>
				<span class="entry-editor__head">
					<span>{{ t('keenext', 'Attachments') }}</span>
					<NcButton @click="fileInput?.click()">
						<template #icon>
							<NcIconSvgWrapper :path="mdiPaperclip" />
						</template>
						{{ t('keenext', 'Add attachment') }}
					</NcButton>
				</span>
			</template>
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
		</FormSection>

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
import NcSelect from '@nextcloud/vue/components/NcSelect'
import EntryIcon from './EntryIcon.vue'
import FormField from './FormField.vue'
import FormSection from './FormSection.vue'
import IconButton from './IconButton.vue'
import IconPickerDialog from './IconPickerDialog.vue'
import PasswordGeneratorDialog from './PasswordGeneratorDialog.vue'
import PasswordInput from './PasswordInput.vue'
import StrengthMeter from './StrengthMeter.vue'
import TextAreaInput from './TextAreaInput.vue'
import TextInput from './TextInput.vue'
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
	gap: 32px;
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

.entry-editor__group {
	display: flex;
	flex-direction: column;
	gap: 16px;
}

.entry-editor__head {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.entry-editor__label {
	font-weight: 500;
}

.form-field {
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.entry-editor__password {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

/* Fields carry their label above the box, so their bottom edges are what buttons line up with. */
.entry-editor__row {
	display: flex;
	align-items: flex-end;
	gap: 12px;
}

.entry-editor__row > .form-field {
	flex: 1;
	min-width: 0;
}

.entry-editor__expiry {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-end;
	gap: 12px 24px;
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

/* One line like the name field next to it; grows when the value has several lines. The textarea
   reserves 6px above itself for a floating label, which would push its own label up. */
.entry-editor__custom-text :deep(.textarea) {
	margin-block-start: 0;
}

.entry-editor__custom-text :deep(.textarea__input) {
	display: block;
	field-sizing: content;
	min-height: calc(var(--default-clickable-area) - 4px);
	padding-block: 4px;
	line-height: 22px;
	box-sizing: border-box;
}

@container (max-width: 560px) {
	.entry-editor__custom-field {
		grid-template-columns: minmax(0, 1fr) auto auto;
		padding-bottom: 16px;
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
