<template>
	<NcDialog
		:name="t('keenext', 'Database health check')"
		:buttons="buttons"
		size="normal"
		@update:open="(open) => open || emit('close')">
		<div class="report__online">
			<NcButton :disabled="checking" @click="checkOnline">
				<template #icon>
					<NcLoadingIcon v-if="checking" :size="20" />
					<NcIconSvgWrapper v-else :path="mdiCloudSearchOutline" />
				</template>
				{{ breaches ? t('keenext', 'Check again with Have I Been Pwned') : t('keenext', 'Check with Have I Been Pwned') }}
			</NcButton>
			<p class="report__muted">
				{{ t('keenext', 'Looks up whether passwords appear in known data breaches. Only the first 5 characters of each password\'s SHA-1 hash are sent to api.pwnedpasswords.com; the passwords themselves never leave this browser.') }}
			</p>
			<NcNoteCard v-if="breachError" type="error">
				{{ breachError }}
			</NcNoteCard>
			<NcNoteCard v-else-if="breaches && breaches.length === 0" type="success">
				{{ t('keenext', 'None of the passwords appears in a known data breach.') }}
			</NcNoteCard>
		</div>

		<NcEmptyContent v-if="sections.every((section) => section.items.length === 0)" :name="t('keenext', 'No problems found')">
			<template #icon>
				<NcIconSvgWrapper :path="mdiShieldCheckOutline" />
			</template>
		</NcEmptyContent>
		<section v-for="section in sections.filter((candidate) => candidate.items.length > 0)" :key="section.kind" class="report__section">
			<h3>{{ section.title }} ({{ section.items.length }})</h3>
			<ul>
				<NcListItem
					v-for="item in section.items"
					:key="item.id"
					:name="item.title"
					:details="item.detail"
					compact
					@click="open(item.id)">
					<template #subname>
						{{ item.path }}
					</template>
				</NcListItem>
			</ul>
		</section>
	</NcDialog>
</template>

<script setup lang="ts">
import type { KdbxEntry } from 'kdbxweb'
import type { PwnedResult } from '@/core/pwned'
import type { HealthIssue } from '@/core/reports'
import type { OpenDatabase } from '@/stores/vault'

import { mdiCloudSearchOutline, mdiShieldCheckOutline } from '@mdi/js'
import { computed, ref, shallowRef } from 'vue'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcDialog from '@nextcloud/vue/components/NcDialog'
import NcEmptyContent from '@nextcloud/vue/components/NcEmptyContent'
import NcIconSvgWrapper from '@nextcloud/vue/components/NcIconSvgWrapper'
import NcListItem from '@nextcloud/vue/components/NcListItem'
import NcLoadingIcon from '@nextcloud/vue/components/NcLoadingIcon'
import NcNoteCard from '@nextcloud/vue/components/NcNoteCard'
import { findEntry, useDatabaseView } from '@/composables/useDatabase'
import { entryPath, getField, StandardField } from '@/core/entries'
import { checkPwned } from '@/core/pwned'
import { healthReport } from '@/core/reports'
import { n, t } from '@/l10n'
import { fetchPwnedRange } from '@/services/pwned'
import { useVaultStore } from '@/stores/vault'

const props = defineProps<{
	database: OpenDatabase
}>()

const emit = defineEmits<{
	close: []
}>()

const vault = useVaultStore()
const view = useDatabaseView(() => props.database)
// Entries are kdbxweb objects and must not be proxied.
const breaches = shallowRef<PwnedResult[] | null>(null)
const checking = ref(false)
const breachError = ref('')

async function checkOnline(): Promise<void> {
	const db = view.value?.db
	if (!db) {
		return
	}
	checking.value = true
	breachError.value = ''
	try {
		breaches.value = await checkPwned(db, fetchPwnedRange)
	} catch (cause) {
		breachError.value = t('keenext', 'The check failed: {error}', { error: cause instanceof Error ? cause.message : String(cause) })
	} finally {
		checking.value = false
	}
}

function describe(issue: HealthIssue): string {
	switch (issue.kind) {
		case 'weak':
			return issue.detail === 'poor' ? t('keenext', 'Poor') : t('keenext', 'Weak')
		case 'reused':
			return n('keenext', 'Used in {count} entry', 'Used in {count} entries', Number(issue.detail), { count: Number(issue.detail) })
		case 'expiring':
			return n('keenext', 'in {count} day', 'in {count} days', Number(issue.detail), { count: Number(issue.detail) })
		default:
			return issue.entry.times.expiryTime?.toLocaleDateString() ?? ''
	}
}

function reportItem(entry: KdbxEntry, detail: string) {
	return {
		id: entry.uuid.id,
		title: getField(entry, StandardField.Title) || t('keenext', '(no title)'),
		path: entryPath(entry).join(' › '),
		detail,
	}
}

const sections = computed(() => {
	const issues = view.value ? healthReport(view.value.db) : []
	const titles: Record<HealthIssue['kind'], string> = {
		expired: t('keenext', 'Expired'),
		expiring: t('keenext', 'Expiring soon'),
		weak: t('keenext', 'Weak passwords'),
		reused: t('keenext', 'Reused passwords'),
	}
	return [
		{
			kind: 'pwned',
			title: t('keenext', 'Found in data breaches'),
			items: (breaches.value ?? []).map((result) => reportItem(result.entry, n('keenext', 'Seen {count} time', 'Seen {count} times', result.count, { count: result.count.toLocaleString() }))),
		},
		...(Object.keys(titles) as HealthIssue['kind'][]).map((kind) => ({
			kind,
			title: titles[kind],
			items: issues.filter((issue) => issue.kind === kind).map((issue) => reportItem(issue.entry, describe(issue))),
		})),
	]
})

function open(id: string): void {
	const entry = view.value ? findEntry(view.value.db, id) : undefined
	vault.select(props.database.id, { group: entry?.parentGroup?.uuid.id ?? null, entry: id })
	emit('close')
}

const buttons = computed(() => [
	{ label: t('keenext', 'Close'), callback: () => emit('close') },
])
</script>

<style scoped>
.report__online {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: 4px;
	margin-bottom: 16px;
}

.report__section {
	margin-bottom: 16px;
}

.report__muted {
	color: var(--color-text-maxcontrast);
}
</style>
