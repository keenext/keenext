<template>
	<NcDialog
		:name="t('keenext', 'Generate password')"
		:buttons="buttons"
		size="normal"
		@update:open="(open) => open || emit('close')">
		<div class="generator">
			<div class="generator__mode">
				<NcCheckboxRadioSwitch
					v-model="mode"
					value="password"
					type="radio"
					name="generator-mode"
					buttonVariant
					buttonVariantGrouped="horizontal">
					{{ t('keenext', 'Password') }}
				</NcCheckboxRadioSwitch>
				<NcCheckboxRadioSwitch
					v-model="mode"
					value="passphrase"
					type="radio"
					name="generator-mode"
					buttonVariant
					buttonVariantGrouped="horizontal">
					{{ t('keenext', 'Passphrase') }}
				</NcCheckboxRadioSwitch>
			</div>

			<div class="generator__preview">
				<code class="generator__value">{{ value }}</code>
				<NcButton
					variant="tertiary"
					:aria-label="t('keenext', 'Regenerate')"
					:title="t('keenext', 'Regenerate')"
					@click="regenerate">
					<template #icon>
						<NcIconSvgWrapper :path="mdiRefresh" />
					</template>
				</NcButton>
			</div>
			<StrengthMeter :password="value" />
			<p v-if="error" class="generator__error">
				{{ error }}
			</p>

			<template v-if="mode === 'password'">
				<label class="generator__range">
					{{ t('keenext', 'Length: {length}', { length: passwordOptions.length }) }}
					<input
						v-model.number="passwordOptions.length"
						type="range"
						min="4"
						max="128">
				</label>
				<div class="generator__groups">
					<NcCheckboxRadioSwitch
						v-for="group in groupLabels"
						:key="group.id"
						:modelValue="passwordOptions.groups.includes(group.id)"
						@update:modelValue="(checked: boolean) => toggleGroup(group.id, checked)">
						<code>{{ group.label }}</code>
					</NcCheckboxRadioSwitch>
				</div>
				<NcCheckboxRadioSwitch v-model="passwordOptions.excludeLookAlike">
					{{ t('keenext', 'Exclude look-alike characters') }}
				</NcCheckboxRadioSwitch>
				<NcCheckboxRadioSwitch v-model="passwordOptions.everyGroup">
					{{ t('keenext', 'Pick characters from every group') }}
				</NcCheckboxRadioSwitch>
				<NcTextField v-model="passwordOptions.include" :label="t('keenext', 'Also use these characters')" />
				<NcTextField v-model="passwordOptions.exclude" :label="t('keenext', 'Do not use these characters')" />
			</template>

			<template v-else>
				<label class="generator__range">
					{{ t('keenext', 'Words: {count}', { count: passphraseOptions.words }) }}
					<input
						v-model.number="passphraseOptions.words"
						type="range"
						min="3"
						max="20">
				</label>
				<NcTextField v-model="passphraseOptions.separator" :label="t('keenext', 'Word separator')" />
				<NcSelect
					v-model="passphraseOptions.wordCase"
					:options="['lower', 'upper', 'title', 'mixed']"
					:getOptionLabel="(option: string) => caseLabels[option as WordCase]"
					:inputLabel="t('keenext', 'Word case')"
					:clearable="false" />
			</template>
		</div>
	</NcDialog>
</template>

<script setup lang="ts">
import type { CharacterGroup, PassphraseOptions, PasswordOptions, WordCase } from '@/core/generator'

import { mdiRefresh } from '@mdi/js'
import { computed, reactive, ref, watch } from 'vue'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcCheckboxRadioSwitch from '@nextcloud/vue/components/NcCheckboxRadioSwitch'
import NcDialog from '@nextcloud/vue/components/NcDialog'
import NcIconSvgWrapper from '@nextcloud/vue/components/NcIconSvgWrapper'
import NcSelect from '@nextcloud/vue/components/NcSelect'
import NcTextField from '@nextcloud/vue/components/NcTextField'
import StrengthMeter from './StrengthMeter.vue'
import {
	DEFAULT_PASSPHRASE_OPTIONS,
	DEFAULT_PASSWORD_OPTIONS,
	generatePassphrase,
	generatePassword,
} from '@/core/generator'
import { t } from '@/l10n'

const emit = defineEmits<{
	apply: [password: string]
	close: []
}>()

const STORAGE_KEY = 'keenext:generator'

function loadOptions() {
	try {
		return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
	} catch {
		return {}
	}
}

const stored = loadOptions()
const mode = ref<'password' | 'passphrase'>(stored.mode ?? 'password')
const passwordOptions = reactive<PasswordOptions>({ ...DEFAULT_PASSWORD_OPTIONS, ...stored.password, groups: [...(stored.password?.groups ?? DEFAULT_PASSWORD_OPTIONS.groups)] })
const passphraseOptions = reactive<PassphraseOptions>({ ...DEFAULT_PASSPHRASE_OPTIONS, ...stored.passphrase })
const value = ref('')
const error = ref('')

const groupLabels: { id: CharacterGroup, label: string }[] = [
	{ id: 'upper', label: 'A-Z' },
	{ id: 'lower', label: 'a-z' },
	{ id: 'digits', label: '0-9' },
	{ id: 'braces', label: '( ) [ ] { }' },
	{ id: 'punctuation', label: '. , : ;' },
	{ id: 'quotes', label: '" \'' },
	{ id: 'dashes', label: '- / \\ _ |' },
	{ id: 'math', label: '! * + < = > ?' },
	{ id: 'logograms', label: '# $ % & @ ^ ` ~' },
	{ id: 'extended', label: t('keenext', 'Extended ASCII') },
]

const caseLabels: Record<WordCase, string> = {
	lower: t('keenext', 'lower case'),
	upper: t('keenext', 'UPPER CASE'),
	title: t('keenext', 'Title Case'),
	mixed: t('keenext', 'MiXeD (random per word)'),
}

function toggleGroup(group: CharacterGroup, checked: boolean): void {
	passwordOptions.groups = checked
		? [...passwordOptions.groups, group]
		: passwordOptions.groups.filter((candidate) => candidate !== group)
}

async function regenerate(): Promise<void> {
	error.value = ''
	try {
		value.value = mode.value === 'password'
			? generatePassword({ ...passwordOptions, groups: [...passwordOptions.groups] })
			: await generatePassphrase({ ...passphraseOptions })
	} catch (cause) {
		error.value = cause instanceof Error ? cause.message : String(cause)
		value.value = ''
	}
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode: mode.value, password: passwordOptions, passphrase: passphraseOptions }))
	} catch {
		// Storage may be unavailable (private mode); options then reset next time.
	}
}

watch([mode, passwordOptions, passphraseOptions], () => void regenerate(), { deep: true, immediate: true })

const buttons = computed(() => [
	{ label: t('keenext', 'Cancel'), callback: () => emit('close') },
	{ label: t('keenext', 'Use password'), variant: 'primary' as const, disabled: value.value === '', callback: () => emit('apply', value.value) },
])
</script>

<style scoped>
.generator {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.generator__mode {
	display: flex;
}

.generator__preview {
	display: flex;
	align-items: center;
	gap: 8px;
}

.generator__value {
	flex: 1;
	padding: 8px;
	border-radius: var(--border-radius-large);
	background: var(--color-background-dark);
	font-size: 1.1em;
	overflow-wrap: anywhere;
}

.generator__error {
	color: var(--color-error-text);
}

.generator__range {
	display: flex;
	flex-direction: column;
}

.generator__groups {
	display: flex;
	flex-wrap: wrap;
	gap: 0 16px;
}
</style>
