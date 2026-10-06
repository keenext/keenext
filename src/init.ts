import type { INode } from '@nextcloud/files'

/**
 * Loaded into the Files app (see LoadFilesIntegration.php). Keep it small: it
 * runs on every Files page load.
 */
import { mdiShieldKeyOutline } from '@mdi/js'
import { addNewFileMenuEntry, DefaultType, NewMenuEntryCategory, Permission, registerFileAction } from '@nextcloud/files'
import { generateUrl } from '@nextcloud/router'
import { t } from '@/l10n'

const KDBX_MIME = 'application/x-kdbx'
const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="${mdiShieldKeyOutline}"/></svg>`

function isDatabase(node: INode): boolean {
	return node.mime === KDBX_MIME || node.basename.toLowerCase().endsWith('.kdbx')
}

registerFileAction({
	id: 'keenext-open',
	displayName: () => t('keenext', 'Open in KeeNext'),
	iconSvgInline: () => icon,
	enabled: ({ nodes }) => nodes.length === 1
		&& isDatabase(nodes[0]!)
		&& nodes[0]!.fileid !== undefined
		&& (nodes[0]!.permissions & Permission.READ) !== 0,
	exec: async ({ nodes }) => {
		window.location.href = generateUrl('/apps/keenext/?fileId={fileId}', { fileId: nodes[0].fileid! })
		return null
	},
	default: DefaultType.DEFAULT,
	order: -10,
})

addNewFileMenuEntry({
	id: 'keenext-new',
	displayName: t('keenext', 'New KeePass database'),
	category: NewMenuEntryCategory.CreateNew,
	iconSvgInline: icon,
	enabled: (folder) => (folder.permissions & Permission.CREATE) !== 0,
	handler: (folder) => {
		window.location.href = generateUrl('/apps/keenext/?new=1&dir={dir}', { dir: folder.path })
	},
})
