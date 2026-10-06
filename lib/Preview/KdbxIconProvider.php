<?php

declare(strict_types=1);

namespace OCA\NextKeeWeb\Preview;

use OCP\Files\File;
use OCP\Files\FileInfo;
use OCP\IImage;
use OCP\Image;
use OCP\Preview\IProviderV2;

/**
 * Gives .kdbx files their own icon in the Files app. Nextcloud only resolves
 * mime type icons from core, so the icon is delivered as a "preview" instead.
 * The database itself is never read.
 */
final class KdbxIconProvider implements IProviderV2 {
	public const MIME_REGEX = '/^application\/x-kdbx$/';

	#[\Override]
	public function getMimeType(): string {
		return self::MIME_REGEX;
	}

	#[\Override]
	public function isAvailable(FileInfo $file): bool {
		return true;
	}

	#[\Override]
	public function getThumbnail(File $file, int $maxX, int $maxY): ?IImage {
		$icon = file_get_contents(__DIR__ . '/../../img/kdbx-preview.png');
		if ($icon === false) {
			return null;
		}
		$image = new Image();
		$image->loadFromData($icon);
		if (!$image->valid()) {
			return null;
		}
		$image->scaleDownToFit($maxX, $maxY);
		return $image;
	}
}
