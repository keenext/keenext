<?php

declare(strict_types=1);

namespace OCA\NextKeeWeb\AppInfo;

use OCA\Files\Event\LoadAdditionalScriptsEvent;
use OCA\NextKeeWeb\Listener\LoadFilesIntegration;
use OCA\NextKeeWeb\Preview\KdbxIconProvider;
use OCP\AppFramework\App;
use OCP\AppFramework\Bootstrap\IBootContext;
use OCP\AppFramework\Bootstrap\IBootstrap;
use OCP\AppFramework\Bootstrap\IRegistrationContext;

final class Application extends App implements IBootstrap {
	public const APP_ID = 'nextkeeweb';

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
