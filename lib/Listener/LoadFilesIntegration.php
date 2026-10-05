<?php

declare(strict_types=1);

namespace OCA\KeePassWeb\Listener;

use OCA\Files\Event\LoadAdditionalScriptsEvent;
use OCA\KeePassWeb\AppInfo\Application;
use OCP\EventDispatcher\Event;
use OCP\EventDispatcher\IEventListener;
use OCP\Util;

/**
 * Adds the "open with KeePass Web" default action for .kdbx files and the
 * "New KeePass database" entry to the Files app. Init scripts run before the
 * Files app reads its action registry.
 *
 * @template-implements IEventListener<LoadAdditionalScriptsEvent>
 */
final class LoadFilesIntegration implements IEventListener {
	#[\Override]
	public function handle(Event $event): void {
		if (!$event instanceof LoadAdditionalScriptsEvent) {
			return;
		}
		Util::addInitScript(Application::APP_ID, Application::APP_ID . '-init');
		Util::addTranslations(Application::APP_ID);
	}
}
