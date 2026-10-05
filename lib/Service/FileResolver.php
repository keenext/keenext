<?php

declare(strict_types=1);

namespace OCA\KeePassWeb\Service;

use OCP\Files\File;
use OCP\Files\IRootFolder;
use OCP\Files\NotFoundException;

/**
 * Resolves file ids within a user's own view, so the client can keep stable ids
 * (recent list, links from the Files app) while files get renamed or moved.
 */
class FileResolver {
	public function __construct(
		private IRootFolder $rootFolder,
	) {
	}

	/**
	 * @return array{fileId: int, name: string, path: string, size: int, mtime: int, etag: string, writable: bool}
	 * @throws NotFoundException if the id does not resolve to a readable file of this user
	 */
	public function describe(string $userId, int $fileId): array {
		$userFolder = $this->rootFolder->getUserFolder($userId);
		$node = $userFolder->getFirstNodeById($fileId);
		if (!$node instanceof File || !$node->isReadable()) {
			throw new NotFoundException('File not found');
		}
		return [
			'fileId' => $fileId,
			'name' => $node->getName(),
			'path' => $userFolder->getRelativePath($node->getPath()) ?? '',
			'size' => (int)$node->getSize(),
			'mtime' => $node->getMTime(),
			'etag' => $node->getEtag(),
			'writable' => $node->isUpdateable(),
		];
	}
}
