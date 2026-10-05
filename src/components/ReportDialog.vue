<template>
	<NcDialog
		:name="t('keepassweb', 'Database health check')"
		:buttons="buttons"
		size="normal"
		@update:open="(open) => open || emit('close')">
		<NcEmptyContent v-if="sections.every((section) => section.items.length === 0)" :name="t('keepassweb', 'No problems found')">
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
import type { HealthIssue } from '@/core/reports'
import type { OpenDatabase } from '@/stores/vault'

import { mdiShieldCheckOutline } from '@mdi/js'
import { computed } from 'vue'
import NcDialog from '@nextcloud/vue/components/NcDialog'
import NcEmptyContent from '@nextcloud/vue/components/NcEmptyContent'
import NcIconSvgWrapper from '@nextcloud/vue/components/NcIconSvgWrapper'
import NcListItem from '@nextcloud/vue/components/NcListItem'
import { useDatabaseView } from '@/composables/useDatabase'
import { entryPath, getField, StandardField } from '@/core/entries'
import { healthReport } from '@/core/reports'
import { n, t } from '@/l10n'
import { useVaultStore } from '@/stores/vault'

const props = defineProps<{
	database: OpenDatabase
}>()

const emit = defineEmits<{
	close: []
}>()

const vault = useVaultStore()
const view = useDatabaseView(() => props.database)

function describe(issue: HealthIssue): string {
	switch (issue.kind) {
		case 'weak':
			return issue.detail === 'poor' ? t('keepassweb', 'Poor') : t('keepassweb', 'Weak')
		case 'reused':
			return n('keepassweb', 'Used in {count} entry', 'Used in {count} entries', Number(issue.detail), { count: Number(issue.detail) })
		case 'expiring':
			return n('keepassweb', 'in {count} day', 'in {count} days', Number(issue.detail), { count: Number(issue.detail) })
		default:
			return issue.entry.times.expiryTime?.toLocaleDateString() ?? ''
	}
}

const sections = computed(() => {
	const issues = view.value ? healthReport(view.value.db) : []
	const titles: Record<HealthIssue['kind'], string> = {
		expired: t('keepassweb', 'Expired'),
		expiring: t('keepassweb', 'Expiring soon'),
		weak: t('keepassweb', 'Weak passwords'),
		reused: t('keepassweb', 'Reused passwords'),
	}
	return (Object.keys(titles) as HealthIssue['kind'][]).map((kind) => ({
		kind,
		title: titles[kind],
		items: issues.filter((issue) => issue.kind === kind).map((issue) => ({
			id: issue.entry.uuid.id,
			title: getField(issue.entry, StandardField.Title) || t('keepassweb', '(no title)'),
			path: entryPath(issue.entry).join(' › '),
			detail: describe(issue),
		})),
	}))
})

function open(id: string): void {
	const entry = view.value?.db.getDefaultGroup()
	const group = entry && [...entry.allEntries()].find((candidate) => candidate.uuid.id === id)?.parentGroup
	vault.select(props.database.id, { group: group?.uuid.id ?? null, entry: id })
	emit('close')
}

const buttons = computed(() => [
	{ label: t('keepassweb', 'Close'), callback: () => emit('close') },
])
</script>

<style scoped>
.report__section {
	margin-bottom: 16px;
}
</style>
