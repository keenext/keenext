import type { Kdbx } from 'kdbxweb'

import * as mdi from '@mdi/js'

/** KeePass standard icons (PwIcon 0–68) mapped to Material Design Icons, by index. */
const standardIcons = [
	mdi.mdiKey,
	mdi.mdiWeb,
	mdi.mdiAlert,
	mdi.mdiServerNetwork,
	mdi.mdiFolderStar,
	mdi.mdiAccountGroup,
	mdi.mdiPuzzle,
	mdi.mdiNotebook,
	mdi.mdiEarth,
	mdi.mdiCardAccountDetails,
	mdi.mdiFileDocumentCheck,
	mdi.mdiCamera,
	mdi.mdiRemote,
	mdi.mdiKeyChain,
	mdi.mdiFlash,
	mdi.mdiScanner,
	mdi.mdiStarCircle,
	mdi.mdiDisc,
	mdi.mdiMonitor,
	mdi.mdiEmail,
	mdi.mdiCog,
	mdi.mdiClipboardCheck,
	mdi.mdiFilePlus,
	mdi.mdiMonitorDashboard,
	mdi.mdiFlashAlert,
	mdi.mdiEmailBox,
	mdi.mdiHarddisk,
	mdi.mdiNas,
	mdi.mdiFileQuestion,
	mdi.mdiConsoleNetwork,
	mdi.mdiConsole,
	mdi.mdiPrinter,
	mdi.mdiApps,
	mdi.mdiPlay,
	mdi.mdiCogOutline,
	mdi.mdiLaptop,
	mdi.mdiArchive,
	mdi.mdiBank,
	mdi.mdiMicrosoftWindows,
	mdi.mdiClockOutline,
	mdi.mdiEmailSearch,
	mdi.mdiFlag,
	mdi.mdiMemory,
	mdi.mdiDelete,
	mdi.mdiNoteText,
	mdi.mdiCalendarRemove,
	mdi.mdiInformation,
	mdi.mdiPackageVariant,
	mdi.mdiFolder,
	mdi.mdiFolderOpen,
	mdi.mdiFolderZip,
	mdi.mdiLockOpen,
	mdi.mdiFileLock,
	mdi.mdiCheckCircle,
	mdi.mdiPen,
	mdi.mdiImage,
	mdi.mdiBookOpenVariant,
	mdi.mdiFormatListBulleted,
	mdi.mdiAccountKey,
	mdi.mdiTools,
	mdi.mdiHome,
	mdi.mdiStar,
	mdi.mdiPenguin,
	mdi.mdiFeather,
	mdi.mdiApple,
	mdi.mdiWikipedia,
	mdi.mdiCash,
	mdi.mdiCertificate,
	mdi.mdiCellphone,
]

export const STANDARD_ICON_COUNT = standardIcons.length

export function standardIconPath(index: number | undefined, fallback = mdi.mdiKey): string {
	return (index !== undefined ? standardIcons[index] : undefined) ?? fallback
}

const customIconUrls = new WeakMap<Kdbx, Map<string, string>>()

/** Object URL for a custom (PNG) icon by UUID; cached per database, revoked with `releaseIcons`. */
export function customIconUrl(db: Kdbx, uuid: string | undefined): string | undefined {
	const icon = uuid ? db.meta.customIcons.get(uuid) : undefined
	if (!uuid || !icon) {
		return undefined
	}
	let urls = customIconUrls.get(db)
	if (!urls) {
		urls = new Map()
		customIconUrls.set(db, urls)
	}
	let url = urls.get(uuid)
	if (!url) {
		url = URL.createObjectURL(new Blob([icon.data]))
		urls.set(uuid, url)
	}
	return url
}

export function releaseIcons(db: Kdbx): void {
	for (const url of customIconUrls.get(db)?.values() ?? []) {
		URL.revokeObjectURL(url)
	}
	customIconUrls.delete(db)
}
