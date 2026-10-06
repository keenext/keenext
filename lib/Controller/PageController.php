<?php

declare(strict_types=1);

namespace OCA\KeeNext\Controller;

use OCA\KeeNext\AppInfo\Application;
use OCA\KeeNext\Service\SettingsService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\FrontpageRoute;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\Attribute\OpenAPI;
use OCP\AppFramework\Http\ContentSecurityPolicy;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\AppFramework\Services\IInitialState;
use OCP\IRequest;
use OCP\IUserSession;
use OCP\Util;

#[OpenAPI(scope: OpenAPI::SCOPE_IGNORE)]
final class PageController extends Controller {
	public function __construct(
		IRequest $request,
		private IUserSession $userSession,
		private SettingsService $settings,
		private IInitialState $initialState,
	) {
		parent::__construct(Application::APP_ID, $request);
	}

	/**
	 * The whole app is one page; `fileId` (from the Files app or a recent entry)
	 * is read by the client.
	 */
	#[NoAdminRequired]
	#[NoCSRFRequired]
	#[FrontpageRoute(verb: 'GET', url: '/')]
	public function index(): TemplateResponse {
		$user = $this->userSession->getUser();
		if ($user !== null) {
			$this->initialState->provideInitialState('settings', $this->settings->get($user->getUID()));
		}

		Util::addScript(Application::APP_ID, Application::APP_ID . '-main');
		Util::addStyle(Application::APP_ID, Application::APP_ID . '-main');
		Util::addTranslations(Application::APP_ID);
		$response = new TemplateResponse(Application::APP_ID, 'main');

		$csp = new ContentSecurityPolicy();
		// Argon2 runs as WebAssembly in a same-origin worker.
		$csp->allowEvalWasm(true);
		$csp->addAllowedWorkerSrcDomain("'self'");
		// Opt-in breach check from the health report; only SHA-1 prefixes are sent.
		$csp->addAllowedConnectDomain('https://api.pwnedpasswords.com');
		$response->setContentSecurityPolicy($csp);
		return $response;
	}
}
