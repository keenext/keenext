<template>
	<NcAppNavigation :aria-label="t('keepassweb', 'Databases')">
		<template #list>
			<NcAppNavigationCaption v-if="vault.databases.length > 0" :name="t('keepassweb', 'Open databases')" />
			<NcAppNavigationItem
				v-for="database in vault.databases"
				:key="database.id"
				:name="database.name"
				:title="database.path"
				:active="database.id === vault.activeId && !database.session"
				:allow-collapse="database.session !== null"
				:open="database.id === vault.activeId"
				@click="vault.activeId = database.id">
				<template #icon>
					<NcLoadingIcon v-if="database.saving" :size="20" />
					<NcIconSvgWrapper v-else :path="database.session ? mdiShieldKeyOutline : mdiLock" />
				</template>
				<template v-if="database.dirty" #counter>
					<span class="unsaved-dot" :title="t('keepassweb', 'Unsaved changes')" />
				</template>
				<template #actions>
					<template v-if="database.session">
						<NcActionButton :disabled="!database.writable" close-after-click @click="vault.save(database.id)">
							<template #icon>
								<NcIconSvgWrapper :path="mdiContentSave" />
							</template>
							{{ t('keepassweb', 'Save') }}
						</NcActionButton>
						<NcActionButton close-after-click @click="databaseSettings = database.id">
							<template #icon>
								<NcIconSvgWrapper :path="mdiCog" />
							</template>
							{{ t('keepassweb', 'Database settings') }}
						</NcActionButton>
						<NcActionButton close-after-click @click="vault.lock(database.id)">
							<template #icon>
								<NcIconSvgWrapper :path="mdiLock" />
							</template>
							{{ t('keepassweb', 'Lock') }}
						</NcActionButton>
					</template>
					<NcActionButton close-after-click @click="vault.close(database.id)">
						<template #icon>
							<NcIconSvgWrapper :path="mdiClose" />
						</template>
						{{ t('keepassweb', 'Close') }}
					</NcActionButton>
				</template>

				<GroupTreeItem
					v-if="database.session && database.id === vault.activeId"
					:key="rootGroup(database).uuid.id"
					:database="database"
					:group="rootGroup(database)" />
			</NcAppNavigationItem>
		</template>

		<template #footer>
			<ul class="app-navigation-footer">
				<NcAppNavigationItem :name="t('keepassweb', 'Open database')" @click="emit('open-database')">
					<template #icon>
						<NcIconSvgWrapper :path="mdiFolderOpenOutline" />
					</template>
				</NcAppNavigationItem>
				<NcAppNavigationItem :name="t('keepassweb', 'New database')" @click="emit('new-database')">
					<template #icon>
						<NcIconSvgWrapper :path="mdiPlus" />
					</template>
				</NcAppNavigationItem>
				<NcAppNavigationItem :name="t('keepassweb', 'Settings')" @click="emit('open-settings')">
					<template #icon>
						<NcIconSvgWrapper :path="mdiCog" />
					</template>
				</NcAppNavigationItem>
			</ul>
		</template>

		<DatabaseSettingsDialog
			v-if="databaseSettings !== null"
			:database="vault.databases.find((database) => database.id === databaseSettings)!"
			@close="databaseSettings = null" />
	</NcAppNavigation>
</template>

<script setup lang="ts">
import { mdiClose, mdiCog, mdiContentSave, mdiFolderOpenOutline, mdiLock, mdiPlus, mdiShieldKeyOutline } from '@mdi/js'
import { t } from '@nextcloud/l10n'
import NcActionButton from '@nextcloud/vue/components/NcActionButton'
import NcAppNavigation from '@nextcloud/vue/components/NcAppNavigation'
import NcAppNavigationCaption from '@nextcloud/vue/components/NcAppNavigationCaption'
import NcAppNavigationItem from '@nextcloud/vue/components/NcAppNavigationItem'
import NcIconSvgWrapper from '@nextcloud/vue/components/NcIconSvgWrapper'
import NcLoadingIcon from '@nextcloud/vue/components/NcLoadingIcon'
import type { KdbxGroup } from 'kdbxweb'
import { ref } from 'vue'
import { type OpenDatabase, useVaultStore } from '@/stores/vault'
import DatabaseSettingsDialog from './DatabaseSettingsDialog.vue'
import GroupTreeItem from './GroupTreeItem.vue'

const emit = defineEmits<{
	'open-database': []
	'new-database': []
	'open-settings': []
}>()

const vault = useVaultStore()
const databaseSettings = ref<string | null>(null)

/** Reads the revision so the tree re-renders when a sync replaces the database instance. */
function rootGroup(database: OpenDatabase): KdbxGroup {
	void database.revision
	return database.session!.db.getDefaultGroup()
}
</script>

<style scoped>
.unsaved-dot {
	display: inline-block;
	width: 8px;
	height: 8px;
	border-radius: 50%;
	background: var(--color-warning);
}

.app-navigation-footer {
	padding: var(--app-navigation-padding, 4px);
}
</style>
