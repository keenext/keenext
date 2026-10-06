import type { INode } from '@nextcloud/files'

import { FilePickerClosed, getFilePickerBuilder } from '@nextcloud/dialogs'
import { FileType } from '@nextcloud/files'
import { t } from '@/l10n'

export interface PickedFile {
	fileId: number
	name: string
	path: string
}

function toPicked(node: INode): PickedFile {
	return { fileId: node.fileid!, name: node.basename, path: node.path }
}

/** Resolves to null when the picker is closed without a choice. */
async function pick(build: () => Promise<INode[]>): Promise<INode | null> {
	try {
		return (await build())[0] ?? null
	} catch (error) {
		if (error instanceof FilePickerClosed) {
			return null
		}
		throw error
	}
}

export async function pickDatabase(): Promise<PickedFile | null> {
	const node = await pick(() => getFilePickerBuilder(t('nextkeeweb', 'Open KeePass database'))
		.setMultiSelect(false)
		.setFilter((candidate) => candidate.type === FileType.Folder || candidate.basename.toLowerCase().endsWith('.kdbx'))
		.addButton({ label: t('nextkeeweb', 'Open'), callback: () => undefined, variant: 'primary' })
		.build()
		.pickNodes())
	return node ? toPicked(node) : null
}

/** Starts in `startAt` (usually the database's folder), where key files tend to live. */
export async function pickKeyFile(startAt = '/'): Promise<PickedFile | null> {
	const node = await pick(() => getFilePickerBuilder(t('nextkeeweb', 'Choose key file'))
		.setMultiSelect(false)
		.startAt(startAt)
		.addButton({ label: t('nextkeeweb', 'Use as key file'), callback: () => undefined, variant: 'primary' })
		.build()
		.pickNodes())
	return node ? toPicked(node) : null
}

export async function pickFolder(startAt = '/'): Promise<string | null> {
	const node = await pick(() => getFilePickerBuilder(t('nextkeeweb', 'Choose folder'))
		.setMultiSelect(false)
		.startAt(startAt)
		.allowDirectories(true)
		.setFilter((candidate) => candidate.type === FileType.Folder)
		.addButton({ label: t('nextkeeweb', 'Choose'), callback: () => undefined, variant: 'primary' })
		.build()
		.pickNodes())
	return node ? node.path : null
}
