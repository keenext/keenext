<?php

declare(strict_types=1);

namespace OCA\KeePassWeb\Service;

use OCA\KeePassWeb\AppInfo\Application;
use OCP\AppFramework\Utility\ITimeFactory;
use OCP\Config\IUserConfig;
use OCP\Files\NotFoundException;

/**
 * Per-user list of recently opened databases, stored as file ids in the user
 * config. Paths are resolved on every read, so renames and moves are followed
 * and files that are gone (or no longer shared) drop out.
 *
 * Optionally remembers which file was used as key file (its id, never its
 * content), like KeePassXC's "remember key files".
 */
final class RecentFilesService {
	public const MAX_ENTRIES = 10;
	private const CONFIG_KEY = 'recent_files';

	public function __construct(
		private IUserConfig $userConfig,
		private FileResolver $fileResolver,
		private ITimeFactory $timeFactory,
	) {
	}

	/**
	 * @return list<array{fileId: int, name: string, path: string, size: int, mtime: int, etag: string, writable: bool, openedAt: int, keyFile: ?array{fileId: int, name: string, path: string}}>
	 */
	public function list(string $userId): array {
		$stored = $this->load($userId);
		$result = [];
		$kept = [];
		foreach ($stored as $item) {
			try {
				$file = $this->fileResolver->describe($userId, $item['fileId']);
			} catch (NotFoundException) {
				continue;
			}
			$result[] = $file + [
				'openedAt' => $item['openedAt'],
				'keyFile' => $this->describeKeyFile($userId, $item['keyFileId']),
			];
			$kept[] = $item;
		}
		if (count($kept) !== count($stored)) {
			$this->store($userId, $kept);
		}
		return $result;
	}

	/**
	 * @return ?array{fileId: int, name: string, path: string}
	 */
	private function describeKeyFile(string $userId, ?int $keyFileId): ?array {
		if ($keyFileId === null) {
			return null;
		}
		try {
			$keyFile = $this->fileResolver->describe($userId, $keyFileId);
		} catch (NotFoundException) {
			return null;
		}
		return ['fileId' => $keyFile['fileId'], 'name' => $keyFile['name'], 'path' => $keyFile['path']];
	}

	/**
	 * Moves the file to the top of the list.
	 *
	 * @param ?int $keyFileId key file to remember for this database, null to forget it
	 * @throws NotFoundException if a file is not accessible to the user
	 */
	public function touch(string $userId, int $fileId, ?int $keyFileId = null): void {
		$this->fileResolver->describe($userId, $fileId);
		if ($keyFileId !== null) {
			$this->fileResolver->describe($userId, $keyFileId);
		}
		$items = array_values(array_filter(
			$this->load($userId),
			static fn (array $item): bool => $item['fileId'] !== $fileId,
		));
		array_unshift($items, ['fileId' => $fileId, 'openedAt' => $this->timeFactory->getTime(), 'keyFileId' => $keyFileId]);
		$this->store($userId, array_slice($items, 0, self::MAX_ENTRIES));
	}

	public function remove(string $userId, int $fileId): void {
		$items = array_values(array_filter(
			$this->load($userId),
			static fn (array $item): bool => $item['fileId'] !== $fileId,
		));
		$this->store($userId, $items);
	}

	public function clear(string $userId): void {
		$this->userConfig->deleteUserConfig($userId, Application::APP_ID, self::CONFIG_KEY);
	}

	/**
	 * @return list<array{fileId: int, openedAt: int, keyFileId: ?int}>
	 */
	private function load(string $userId): array {
		$raw = $this->userConfig->getValueArray($userId, Application::APP_ID, self::CONFIG_KEY);
		$items = [];
		foreach ($raw as $item) {
			if (is_array($item) && is_int($item['fileId'] ?? null) && is_int($item['openedAt'] ?? null)) {
				$keyFileId = $item['keyFileId'] ?? null;
				$items[] = [
					'fileId' => $item['fileId'],
					'openedAt' => $item['openedAt'],
					'keyFileId' => is_int($keyFileId) ? $keyFileId : null,
				];
			}
		}
		return $items;
	}

	/**
	 * @param list<array{fileId: int, openedAt: int, keyFileId: ?int}> $items
	 */
	private function store(string $userId, array $items): void {
		$this->userConfig->setValueArray($userId, Application::APP_ID, self::CONFIG_KEY, $items);
	}
}
