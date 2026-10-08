<template>
	<form class="entry-editor" @submit.prevent="save">
		<h2>{{ entry ? t('keenext', 'Edit entry') : t('keenext', 'New entry') }}</h2>

		<section class="entry-editor__card">
			<div class="entry-editor__title">
				<NcButton
					:aria-label="t('keenext', 'Choose icon')"
					:title="t('keenext', 'Choose icon')"
					@click="iconOpen = true">
					<template #icon>
						<EntryIcon
							v-if="view"
							:db="view.db"
							:icon="draft.icon"
							:customIcon="draft.customIcon" />
					</template>
				</NcButton>
				<NcTextField v-model="draft.title" :label="t('keenext', 'Title')" autofocus />
			</div>
			<NcTextField v-model="draft.username" :label="t('keenext', 'Username')" autocomplete="off" />
			<div class="entry-editor__password">
				<NcPasswordField
					v-model="draft.password"
					:label="t('keenext', 'Password')"
					autocomplete="new-password"
					:checkPasswordStrength="false" />
				<NcButton :aria-label="t('keenext', 'Generate password')" :title="t('keenext', 'Generate password')" @click="generatorOpen = true">
					<template #icon>
						<NcIconSvgWrapper :path="mdiDiceMultiple" />
					</template>
				</NcButton>
			</div>
			<StrengthMeter v-if="draft.password" :password="draft.password" />
			<NcTextField v-model="draft.url" :label="t('keenext', 'URL')" type="url" />
		</section>

		<section class="entry-editor__card">
			<NcSelect
				v-model="draft.tags"
				:options="knownTags"
				:inputLabel="t('keenext', 'Tags')"
				multiple
				taggable
				keepOpen />
			<div class="entry-editor__expiry">
				<NcCheckboxRadioSwitch :modelValue="draft.expires !== null" @update:modelValue="toggleExpiry">
					{{ t('keenext', 'Expires') }}
				</NcCheckboxRadioSwitch>
				<NcDateTimePickerNative
					v-if="draft.expires !== null"
					v-model="draft.expires"
					type="datetime-local"
					:label="t('keenext', 'Expiry date')" />
			</div>
		</section>

		<section class="entry-editor__card">
			<NcTextArea
				v-model="draft.notes"
				:label="t('keenext', 'Notes')"
				resize="vertical"
				rows="4" />
		</section>

		<section class="entry-editor__card">
			<h3>{{ t('keenext', 'Additional attributes') }}</h3>
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
					class="entry-editor__custom-value"
					:label="t('keenext', 'Value')"
					resize="vertical"
					rows="1" />
				<NcButton
					variant="tertiary"
					:pressed="field.protected"
					:aria-label="t('keenext', 'Protect value')"
					:title="t('keenext', 'Protect value (hide and encrypt in memory)')"
					@update:pressed="(pressed) => field.protected = pressed">
					<template #icon>
						<NcIconSvgWrapper :path="field.protected ? mdiLock : mdiLockOpenVariant" />
					</template>
				</NcButton>
				<NcButton variant="tertiary" :aria-label="t('keenext', 'Remove attribute')" @click="draft.customFields.splice(index, 1)">
					<template #icon>
						<NcIconSvgWrapper :path="mdiDelete" />
					</template>
				</NcButton>
			</div>
			<div class="entry-editor__row">
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
		</section>

		<section class="entry-editor__card">
			<h3>{{ t('keenext', 'Attachments') }}</h3>
			<ul>
				<li v-for="(attachment, index) in draft.attachments" :key="attachment.name" class="entry-editor__attachment">
					<NcIconSvgWrapper :path="mdiPaperclip" :size="20" />
					<span class="entry-editor__attachment-name">{{ attachment.name }}</span>
					<NcButton variant="tertiary" :aria-label="t('keenext', 'Remove {name}', { name: attachment.name })" @click="draft.attachments.splice(index, 1)">
						<template #icon>
							<NcIconSvgWrapper :path="mdiDelete" />
						</template>
					</NcButton>
				</li>
			</ul>
			<div class="entry-editor__row">
				<NcButton @click="fileInput?.click()">
					<template #icon>
						<NcIconSvgWrapper :path="mdiPaperclip" />
					</template>
					{{ t('keenext', 'Add attachment') }}
				</NcButton>
			</div>
			<input
				ref="fileInput"
				type="file"
				multiple
				hidden
				@change="addAttachments">
		</section>

		<div class="entry-editor__actions">
			<NcButton wide @click="emit('cancel')">
				{{ t('keenext', 'Cancel') }}
			</NcButton>
			<NcButton
				type="submit"
				variant="primary"
				wide
				:disabled="!valid">
				<template #icon>
					<NcIconSvgWrapper :path="mdiCheck" />
				</template>
				{{ t('keenext', 'Save') }}
			</NcButton>
		</div>

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

import { mdiCheck, mdiDelete, mdiDiceMultiple, mdiLock, mdiLockOpenVariant, mdiPaperclip, mdiPlus, mdiTimerOutline } from '@mdi/js'
import { computed, markRaw, reactive, ref, toRaw } from 'vue'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcCheckboxRadioSwitch from '@nextcloud/vue/components/NcCheckboxRadioSwitch'
import NcDateTimePickerNative from '@nextcloud/vue/components/NcDateTimePickerNative'
import NcIconSvgWrapper from '@nextcloud/vue/components/NcIconSvgWrapper'
import NcPasswordField from '@nextcloud/vue/components/NcPasswordField'
import NcSelect from '@nextcloud/vue/components/NcSelect'
import NcTextArea from '@nextcloud/vue/components/NcTextArea'
import NcTextField from '@nextcloud/vue/components/NcTextField'
import EntryIcon from './EntryIcon.vue'
import IconPickerDialog from './IconPickerDialog.vue'
import PasswordGeneratorDialog from './PasswordGeneratorDialog.vue'
import StrengthMeter from './StrengthMeter.vue'
import TotpSetupDialog from './TotpSetupDialog.vue'
import { findEntry, findGroup, useDatabaseView } from '@/composables/useDatabase'
import { applyDraft, attachFile, createEntry, draftFromEntry, emptyDraft, isStandardField } from '@/core/entries'
import { OTP_FIELD } from '@/core/totp'
import { t } from '@/l10n'
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
	gap: 12px;
}

.entry-editor__card {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius-large);
}

.entry-editor__card h3 {
	margin: 0;
	color: var(--color-text-maxcontrast);
	font-size: var(--font-size-small, 13px);
	font-weight: normal;
}

.entry-editor__title,
.entry-editor__password,
.entry-editor__row,
.entry-editor__attachment {
	display: flex;
	align-items: flex-start;
	gap: 8px;
}

.entry-editor__title {
	align-items: flex-end;
}

.entry-editor__title > :last-child,
.entry-editor__password > :first-child {
	flex: 1;
	min-width: 0;
}

.entry-editor__row {
	flex-wrap: wrap;
}

.entry-editor__custom-field {
	display: grid;
	grid-template-columns: minmax(0, 1fr) minmax(0, 2fr) auto auto;
	align-items: start;
	gap: 8px;
}

@container (max-width: 560px) {
	.entry-editor__custom-field {
		grid-template-columns: minmax(0, 1fr) auto auto;
		padding-bottom: 8px;
		border-bottom: 1px solid var(--color-border);
	}

	.entry-editor__custom-name {
		grid-column: 1 / -1;
	}
}

.entry-editor__expiry {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px 16px;
}

.entry-editor__attachment {
	align-items: center;
}

.entry-editor__attachment-name {
	flex: 1;
	min-width: 0;
	overflow-wrap: anywhere;
}

/* Stays at the bottom of the scrolling pane so saving does not need a scroll to the end of the form. */
.entry-editor__actions {
	position: sticky;
	bottom: 0;
	z-index: 1;
	display: flex;
	justify-content: flex-end;
	gap: 8px;
	margin: 0 calc(-1 * var(--entry-details-padding-x, 0px));
	padding: 12px var(--entry-details-padding-x, 0px);
	border-top: 1px solid var(--color-border);
	background: var(--color-main-background);
}

@container (min-width: 561px) {
	.entry-editor__actions > * {
		flex: 0 0 auto;
		width: auto;
	}
}
</style>
