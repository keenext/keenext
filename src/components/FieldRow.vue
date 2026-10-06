<template>
	<div class="field-row">
		<dt class="field-row__label">
			{{ label }}
		</dt>
		<dd class="field-row__value">
			<span v-if="$slots.default" class="field-row__text">
				<slot />
			</span>
			<a
				v-else-if="link && href"
				:href="href"
				target="_blank"
				rel="noopener noreferrer"
				class="field-row__text">{{ value }}</a>
			<span v-else class="field-row__text" :class="[{ 'field-row__text--secret': secret && !revealed, 'field-row__text--multiline': multiline }]">{{ displayed }}</span>
			<span class="field-row__actions">
				<slot name="actions" />
				<NcButton
					v-if="secret && value"
					variant="tertiary"
					:aria-label="revealed ? t('nextkeeweb', 'Hide') : t('nextkeeweb', 'Show')"
					:title="revealed ? t('nextkeeweb', 'Hide') : t('nextkeeweb', 'Show')"
					@click="revealed = !revealed">
					<template #icon>
						<NcIconSvgWrapper :path="revealed ? mdiEyeOff : mdiEye" />
					</template>
				</NcButton>
				<NcButton
					v-if="value"
					variant="tertiary"
					:aria-label="t('nextkeeweb', 'Copy {field}', { field: label })"
					:title="t('nextkeeweb', 'Copy')"
					@click="emit('copy')">
					<template #icon>
						<NcIconSvgWrapper :path="mdiContentCopy" />
					</template>
				</NcButton>
			</span>
		</dd>
	</div>
</template>

<script setup lang="ts">
import { mdiContentCopy, mdiEye, mdiEyeOff } from '@mdi/js'
import { computed, ref } from 'vue'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcIconSvgWrapper from '@nextcloud/vue/components/NcIconSvgWrapper'
import { openableUrl } from '@/core/urls'
import { t } from '@/l10n'

const props = defineProps<{
	label: string
	value: string
	secret?: boolean
	link?: boolean
	multiline?: boolean
}>()

const emit = defineEmits<{
	copy: []
}>()

const revealed = ref(false)
/** Only safe schemes become links; anything else is shown as text. */
const href = computed(() => props.link ? openableUrl(props.value) : undefined)
const displayed = computed(() => props.secret && !revealed.value && props.value ? '••••••••••••' : props.value)
</script>

<style scoped>
.field-row {
	display: grid;
	grid-template-columns: minmax(100px, 160px) 1fr;
	gap: 8px;
	align-items: center;
	padding: 2px 0;
	border-bottom: 1px solid var(--color-border);
}

.field-row__label {
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.field-row__value {
	display: flex;
	align-items: center;
	gap: 4px;
	min-height: var(--default-clickable-area);
	min-width: 0;
}

.field-row__text {
	flex: 1;
	min-width: 0;
	overflow-wrap: anywhere;
}

.field-row__text--secret {
	font-family: var(--font-face-monospace, monospace);
	letter-spacing: 1px;
}

.field-row__text--multiline {
	white-space: pre-wrap;
}

.field-row__actions {
	display: flex;
	flex-shrink: 0;
}
</style>
