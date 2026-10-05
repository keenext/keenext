import { FilePickerClosed, getFilePickerBuilder } from '@nextcloud/dialogs'
import { FileType, type INode } from '@nextcloud/files'
import { t } from '@nextcloud/l10n'

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
	const node = await pick(() => getFilePickerBuilder(t('keepassweb', 'Open KeePass database'))
		.setMultiSelect(false)
		.setFilter((candidate) => candidate.type === FileType.Folder || candidate.basename.toLowerCase().endsWith('.kdbx'))
		.addButton({ label: t('keepassweb', 'Open'), callback: () => undefined, variant: 'primary' })
		.build()
		.pickNodes())
	return node ? toPicked(node) : null
}

export async function pickKeyFile(): Promise<PickedFile | null> {
	const node = await pick(() => getFilePickerBuilder(t('keepassweb', 'Choose key file'))
		.setMultiSelect(false)
		.addButton({ label: t('keepassweb', 'Use as key file'), callback: () => undefined, variant: 'primary' })
		.build()
		.pickNodes())
	return node ? toPicked(node) : null
}

export async function pickFolder(): Promise<string | null> {
	const node = await pick(() => getFilePickerBuilder(t('keepassweb', 'Choose folder'))
		.setMultiSelect(false)
		.allowDirectories(true)
		.setFilter((candidate) => candidate.type === FileType.Folder)
		.addButton({ label: t('keepassweb', 'Choose'), callback: () => undefined, variant: 'primary' })
		.build()
		.pickNodes())
	return node ? node.path : null
}
