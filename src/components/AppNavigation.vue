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
				:allowCollapse="database.session !== null"
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
						<NcActionButton :disabled="!database.writable" closeAfterClick @click="vault.save(database.id)">
							<template #icon>
								<NcIconSvgWrapper :path="mdiContentSave" />
							</template>
							{{ t('keepassweb', 'Save') }}
						</NcActionButton>
						<NcActionButton closeAfterClick @click="databaseSettings = database.id">
							<template #icon>
								<NcIconSvgWrapper :path="mdiCog" />
							</template>
							{{ t('keepassweb', 'Database settings') }}
						</NcActionButton>
						<NcActionButton closeAfterClick @click="vault.lock(database.id)">
							<template #icon>
								<NcIconSvgWrapper :path="mdiLock" />
							</template>
							{{ t('keepassweb', 'Lock') }}
						</NcActionButton>
					</template>
					<NcActionButton closeAfterClick @click="vault.close(database.id)">
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
				<NcAppNavigationItem :name="t('keepassweb', 'Open database')" @click="emit('openDatabase')">
					<template #icon>
						<NcIconSvgWrapper :path="mdiFolderOpenOutline" />
					</template>
				</NcAppNavigationItem>
				<NcAppNavigationItem :name="t('keepassweb', 'New database')" @click="emit('newDatabase')">
					<template #icon>
						<NcIconSvgWrapper :path="mdiPlus" />
					</template>
				</NcAppNavigationItem>
				<NcAppNavigationItem :name="t('keepassweb', 'Settings')" @click="emit('openSettings')">
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
import type { KdbxGroup } from 'kdbxweb'
import type { OpenDatabase } from '@/stores/vault'

import { mdiClose, mdiCog, mdiContentSave, mdiFolderOpenOutline, mdiLock, mdiPlus, mdiShieldKeyOutline } from '@mdi/js'
import { ref } from 'vue'
import NcActionButton from '@nextcloud/vue/components/NcActionButton'
import NcAppNavigation from '@nextcloud/vue/components/NcAppNavigation'
import NcAppNavigationCaption from '@nextcloud/vue/components/NcAppNavigationCaption'
import NcAppNavigationItem from '@nextcloud/vue/components/NcAppNavigationItem'
import NcIconSvgWrapper from '@nextcloud/vue/components/NcIconSvgWrapper'
import NcLoadingIcon from '@nextcloud/vue/components/NcLoadingIcon'
import DatabaseSettingsDialog from './DatabaseSettingsDialog.vue'
import GroupTreeItem from './GroupTreeItem.vue'
import { t } from '@/l10n'
import { useVaultStore } from '@/stores/vault'

const emit = defineEmits<{
	openDatabase: []
	newDatabase: []
	openSettings: []
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
