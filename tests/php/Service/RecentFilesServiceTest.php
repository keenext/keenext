<?php

declare(strict_types=1);

namespace OCA\NextKeeWeb\Tests\Service;

use OCA\NextKeeWeb\Service\FileResolver;
use OCA\NextKeeWeb\Service\RecentFilesService;
use OCP\AppFramework\Utility\ITimeFactory;
use OCP\Config\IUserConfig;
use OCP\Files\NotFoundException;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;

class RecentFilesServiceTest extends TestCase {
	/** @var array<string, array> in-memory user config */
	private array $config = [];
	/** @var array<int, string> file id => path of files the user can access */
	private array $files = [];
	private int $now = 1000;
	private RecentFilesService $service;

	protected function setUp(): void {
		/** @var IUserConfig&MockObject $userConfig */
		$userConfig = $this->createMock(IUserConfig::class);
		$userConfig->method('getValueArray')->willReturnCallback(
			fn (string $user, string $app, string $key, array $default = []) => $this->config["$user/$key"] ?? $default,
		);
		$userConfig->method('setValueArray')->willReturnCallback(
			function (string $user, string $app, string $key, array $value): bool {
				$this->config["$user/$key"] = $value;
				return true;
			},
		);
		$userConfig->method('deleteUserConfig')->willReturnCallback(
			function (string $user, string $app, string $key): void {
				unset($this->config["$user/$key"]);
			},
		);

		/** @var FileResolver&MockObject $resolver */
		$resolver = $this->createMock(FileResolver::class);
		$resolver->method('describe')->willReturnCallback(function (string $user, int $fileId): array {
			if (!isset($this->files[$fileId])) {
				throw new NotFoundException();
			}
			return [
				'fileId' => $fileId,
				'name' => basename($this->files[$fileId]),
				'path' => $this->files[$fileId],
				'size' => 1,
				'mtime' => 1,
				'etag' => 'e',
				'writable' => true,
			];
		});

		/** @var ITimeFactory&MockObject $time */
		$time = $this->createMock(ITimeFactory::class);
		$time->method('getTime')->willReturnCallback(fn () => $this->now++);

		$this->service = new RecentFilesService($userConfig, $resolver, $time);
	}

	public function testMostRecentFirstWithoutDuplicates(): void {
		$this->files = [1 => '/a.kdbx', 2 => '/b.kdbx'];
		$this->service->touch('jan', 1);
		$this->service->touch('jan', 2);
		$this->service->touch('jan', 1);

		$this->assertSame([1, 2], array_column($this->service->list('jan'), 'fileId'));
	}

	public function testFollowsRenamesAndDropsMissingFiles(): void {
		$this->files = [1 => '/a.kdbx', 2 => '/b.kdbx'];
		$this->service->touch('jan', 1);
		$this->service->touch('jan', 2);

		$this->files = [1 => '/moved/a.kdbx'];
		$list = $this->service->list('jan');

		$this->assertSame(['/moved/a.kdbx'], array_column($list, 'path'));
		$this->assertCount(1, $this->config['jan/recent_files']);
	}

	public function testLimitsLength(): void {
		for ($id = 1; $id <= RecentFilesService::MAX_ENTRIES + 3; $id++) {
			$this->files[$id] = "/$id.kdbx";
			$this->service->touch('jan', $id);
		}
		$list = $this->service->list('jan');

		$this->assertCount(RecentFilesService::MAX_ENTRIES, $list);
		$this->assertSame(RecentFilesService::MAX_ENTRIES + 3, $list[0]['fileId']);
	}

	public function testRemembersKeyFileWhileItExists(): void {
		$this->files = [1 => '/a.kdbx', 9 => '/keys/a.keyx'];
		$this->service->touch('jan', 1, 9);

		$this->assertSame(['fileId' => 9, 'name' => 'a.keyx', 'path' => '/keys/a.keyx'], $this->service->list('jan')[0]['keyFile']);

		unset($this->files[9]);
		$this->assertNull($this->service->list('jan')[0]['keyFile']);
	}

	public function testRejectsInaccessibleFiles(): void {
		$this->files = [1 => '/a.kdbx'];
		$this->expectException(NotFoundException::class);
		$this->service->touch('jan', 1, 42);
	}

	public function testIgnoresMalformedStoredData(): void {
		$this->files = [1 => '/a.kdbx'];
		$this->config['jan/recent_files'] = [['fileId' => '1'], 'junk', ['fileId' => 1, 'openedAt' => 5, 'keyFileId' => 'x']];

		$list = $this->service->list('jan');

		$this->assertSame([1], array_column($list, 'fileId'));
		$this->assertNull($list[0]['keyFile']);
	}

	public function testRemoveAndClear(): void {
		$this->files = [1 => '/a.kdbx', 2 => '/b.kdbx'];
		$this->service->touch('jan', 1);
		$this->service->touch('jan', 2);

		$this->service->remove('jan', 2);
		$this->assertSame([1], array_column($this->service->list('jan'), 'fileId'));

		$this->service->clear('jan');
		$this->assertSame([], $this->service->list('jan'));
	}

	public function testUsersAreSeparate(): void {
		$this->files = [1 => '/a.kdbx'];
		$this->service->touch('jan', 1);

		$this->assertSame([], $this->service->list('other'));
	}
}
