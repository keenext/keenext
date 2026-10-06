<?php

declare(strict_types=1);

namespace OCA\KeeNext\AppInfo;

use OCA\Files\Event\LoadAdditionalScriptsEvent;
use OCA\KeeNext\Listener\LoadFilesIntegration;
use OCA\KeeNext\Preview\KdbxIconProvider;
use OCP\AppFramework\App;
use OCP\AppFramework\Bootstrap\IBootContext;
use OCP\AppFramework\Bootstrap\IBootstrap;
use OCP\AppFramework\Bootstrap\IRegistrationContext;

final class Application extends App implements IBootstrap {
	public const APP_ID = 'keenext';

	public function __construct() {
		parent::__construct(self::APP_ID);
	}

	#[\Override]
	public function register(IRegistrationContext $context): void {
		$context->registerEventListener(LoadAdditionalScriptsEvent::class, LoadFilesIntegration::class);
		$context->registerPreviewProvider(KdbxIconProvider::class, KdbxIconProvider::MIME_REGEX);
	}

	#[\Override]
	public function boot(IBootContext $context): void {
	}
}
