<template>
	<div class="start">
		<NcEmptyContent
			:name="t('nextkeeweb', 'KeePass databases')"
			:description="t('nextkeeweb', 'Open a .kdbx database from your Nextcloud or create a new one. Works with KeePassXC, KeePass and KeePassDX.')">
			<template #icon>
				<NcIconSvgWrapper :path="mdiShieldKeyOutline" />
			</template>
			<template #action>
				<div class="start__actions">
					<NcButton variant="primary" @click="emit('openDatabase')">
						<template #icon>
							<NcIconSvgWrapper :path="mdiFolderOpenOutline" />
						</template>
						{{ t('nextkeeweb', 'Open database') }}
					</NcButton>
					<NcButton @click="emit('newDatabase')">
						<template #icon>
							<NcIconSvgWrapper :path="mdiPlus" />
						</template>
						{{ t('nextkeeweb', 'New database') }}
					</NcButton>
				</div>
			</template>
		</NcEmptyContent>

		<section v-if="vault.recent.length > 0" class="start__recent">
			<h3>{{ t('nextkeeweb', 'Recently opened') }}</h3>
			<ul>
				<NcListItem
					v-for="file in vault.recent"
					:key="file.fileId"
					:name="file.name"
					:details="formatRelative(file.openedAt)"
					@click="open(file.fileId)">
					<template #icon>
						<NcIconSvgWrapper :path="mdiShieldKeyOutline" :size="32" />
					</template>
					<template #subname>
						{{ file.path }}<template v-if="file.keyFile">
							· {{ t('nextkeeweb', 'key file: {name}', { name: file.keyFile.name }) }}
						</template>
					</template>
					<template #actions>
						<NcActionButton closeAfterClick @click="remove(file.fileId)">
							<template #icon>
								<NcIconSvgWrapper :path="mdiClose" />
							</template>
							{{ t('nextkeeweb', 'Remove from list') }}
						</NcActionButton>
					</template>
				</NcListItem>
			</ul>
		</section>
	</div>
</template>

<script setup lang="ts">
import { mdiClose, mdiFolderOpenOutline, mdiPlus, mdiShieldKeyOutline } from '@mdi/js'
import { showError } from '@nextcloud/dialogs'
import { formatRelativeTime } from '@nextcloud/l10n'
import NcActionButton from '@nextcloud/vue/components/NcActionButton'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcEmptyContent from '@nextcloud/vue/components/NcEmptyContent'
import NcIconSvgWrapper from '@nextcloud/vue/components/NcIconSvgWrapper'
import NcListItem from '@nextcloud/vue/components/NcListItem'
import { t } from '@/l10n'
import { removeRecent } from '@/services/api'
import { useVaultStore } from '@/stores/vault'

const emit = defineEmits<{
	openDatabase: []
	newDatabase: []
}>()

const vault = useVaultStore()

function formatRelative(seconds: number): string {
	return formatRelativeTime(seconds * 1000)
}

async function open(fileId: number): Promise<void> {
	try {
		await vault.openFile(fileId)
	} catch (error) {
		showError(t('nextkeeweb', 'Could not open the database: {error}', { error: vault.describeError(error) }))
	}
}

async function remove(fileId: number): Promise<void> {
	vault.recent = await removeRecent(fileId)
}
</script>

<style scoped>
.start {
	padding: 16px;
}

.start__actions {
	display: flex;
	flex-wrap: wrap;
	justify-content: center;
	gap: 8px;
}

.start__recent {
	max-width: 700px;
	margin: 0 auto;
}
</style>
