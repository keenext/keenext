<?php

declare(strict_types=1);

namespace OCA\NextKeeWeb\Tests\Service;

use OCA\NextKeeWeb\Service\SettingsService;
use OCP\Config\IUserConfig;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;

class SettingsServiceTest extends TestCase {
	/** @var array<string, bool|int> */
	private array $stored = [];
	private SettingsService $service;

	protected function setUp(): void {
		/** @var IUserConfig&MockObject $userConfig */
		$userConfig = $this->createMock(IUserConfig::class);
		$get = fn (string $user, string $app, string $key, bool|int $default) => $this->stored[$key] ?? $default;
		$set = function (string $user, string $app, string $key, bool|int $value): bool {
			$this->stored[$key] = $value;
			return true;
		};
		$userConfig->method('getValueBool')->willReturnCallback($get);
		$userConfig->method('getValueInt')->willReturnCallback($get);
		$userConfig->method('setValueBool')->willReturnCallback($set);
		$userConfig->method('setValueInt')->willReturnCallback($set);

		$this->service = new SettingsService($userConfig);
	}

	public function testDefaults(): void {
		$settings = $this->service->get('jan');

		$this->assertSame(array_keys(SettingsService::SCHEMA), array_keys($settings));
		$this->assertTrue($settings['autosave']);
		$this->assertSame(15, $settings['lockAfterMinutes']);
	}

	public function testUpdatesKnownKeysAndClampsValues(): void {
		$settings = $this->service->update('jan', [
			'autosave' => 'false',
			'lockAfterMinutes' => 99999,
			'clipboardClearSeconds' => -5,
			'unknown' => 'ignored',
		]);

		$this->assertFalse($settings['autosave']);
		$this->assertSame(1440, $settings['lockAfterMinutes']);
		$this->assertSame(0, $settings['clipboardClearSeconds']);
		$this->assertArrayNotHasKey('unknown', $this->stored);
	}
}
