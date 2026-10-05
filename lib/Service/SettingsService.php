<?php

declare(strict_types=1);

namespace OCA\KeePassWeb\Service;

use OCA\KeePassWeb\AppInfo\Application;
use OCP\Config\IUserConfig;

/**
 * Per-user preferences. The schema lives here only: unknown keys are dropped and
 * values are clamped, so the client can send whatever it holds.
 */
final class SettingsService {
	/** @var array<string, array{type: 'bool'|'int', default: bool|int, min?: int, max?: int}> */
	public const SCHEMA = [
		'autosave' => ['type' => 'bool', 'default' => true],
		// 0 disables the idle lock.
		'lockAfterMinutes' => ['type' => 'int', 'default' => 15, 'min' => 0, 'max' => 1440],
		'lockOnHide' => ['type' => 'bool', 'default' => false],
		// 0 keeps copied values in the clipboard.
		'clipboardClearSeconds' => ['type' => 'int', 'default' => 20, 'min' => 0, 'max' => 600],
		// How often open databases look for changes made elsewhere; 0 disables polling.
		'syncIntervalSeconds' => ['type' => 'int', 'default' => 60, 'min' => 0, 'max' => 3600],
		'rememberKeyFile' => ['type' => 'bool', 'default' => true],
	];

	public function __construct(
		private IUserConfig $userConfig,
	) {
	}

	/**
	 * @return array<string, bool|int>
	 */
	public function get(string $userId): array {
		$settings = [];
		foreach (self::SCHEMA as $key => $definition) {
			$settings[$key] = $definition['type'] === 'bool'
				? $this->userConfig->getValueBool($userId, Application::APP_ID, $key, (bool)$definition['default'])
				: $this->userConfig->getValueInt($userId, Application::APP_ID, $key, (int)$definition['default']);
		}
		return $settings;
	}

	/**
	 * @param array<string, mixed> $values
	 * @return array<string, bool|int>
	 */
	public function update(string $userId, array $values): array {
		foreach ($values as $key => $value) {
			$definition = self::SCHEMA[$key] ?? null;
			if ($definition === null) {
				continue;
			}
			if ($definition['type'] === 'bool') {
				$this->userConfig->setValueBool($userId, Application::APP_ID, $key, filter_var($value, FILTER_VALIDATE_BOOLEAN));
				continue;
			}
			$int = (int)$value;
			$int = max($definition['min'] ?? PHP_INT_MIN, min($definition['max'] ?? PHP_INT_MAX, $int));
			$this->userConfig->setValueInt($userId, Application::APP_ID, $key, $int);
		}
		return $this->get($userId);
	}
}
