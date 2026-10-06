<?php

declare(strict_types=1);

namespace OCA\NextKeeWeb\Controller;

use OCA\NextKeeWeb\AppInfo\Application;
use OCA\NextKeeWeb\Service\FileResolver;
use OCA\NextKeeWeb\Service\RecentFilesService;
use OCA\NextKeeWeb\Service\SettingsService;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\ApiRoute;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\DataResponse;
use OCP\AppFramework\OCS\OCSNotFoundException;
use OCP\AppFramework\OCSController;
use OCP\Files\NotFoundException;
use OCP\IRequest;
use OCP\IUserSession;

/**
 * Metadata only. Database contents never pass through here; the client reads
 * and writes the encrypted files over WebDAV.
 */
final class ApiController extends OCSController {
	public function __construct(
		IRequest $request,
		private IUserSession $userSession,
		private FileResolver $fileResolver,
		private RecentFilesService $recentFiles,
		private SettingsService $settings,
	) {
		parent::__construct(Application::APP_ID, $request);
	}

	private function userId(): string {
		$user = $this->userSession->getUser();
		if ($user === null) {
			throw new \RuntimeException('NoAdminRequired routes always have a user');
		}
		return $user->getUID();
	}

	/**
	 * Current path and state of a file, for opening by id.
	 */
	#[NoAdminRequired]
	#[ApiRoute(verb: 'GET', url: '/api/v1/files/{fileId}', requirements: ['fileId' => '\d+'])]
	public function file(int $fileId): DataResponse {
		try {
			return new DataResponse($this->fileResolver->describe($this->userId(), $fileId));
		} catch (NotFoundException) {
			throw new OCSNotFoundException('File not found');
		}
	}

	#[NoAdminRequired]
	#[ApiRoute(verb: 'GET', url: '/api/v1/recent')]
	public function recent(): DataResponse {
		return new DataResponse($this->recentFiles->list($this->userId()));
	}

	/**
	 * @param int $fileId database that was opened
	 * @param ?int $keyFileId key file used for it, if it should be remembered
	 */
	#[NoAdminRequired]
	#[ApiRoute(verb: 'POST', url: '/api/v1/recent')]
	public function touchRecent(int $fileId, ?int $keyFileId = null): DataResponse {
		try {
			$this->recentFiles->touch($this->userId(), $fileId, $keyFileId);
		} catch (NotFoundException) {
			throw new OCSNotFoundException('File not found');
		}
		return new DataResponse($this->recentFiles->list($this->userId()));
	}

	#[NoAdminRequired]
	#[ApiRoute(verb: 'DELETE', url: '/api/v1/recent/{fileId}', requirements: ['fileId' => '\d+'])]
	public function removeRecent(int $fileId): DataResponse {
		$this->recentFiles->remove($this->userId(), $fileId);
		return new DataResponse($this->recentFiles->list($this->userId()));
	}

	#[NoAdminRequired]
	#[ApiRoute(verb: 'DELETE', url: '/api/v1/recent')]
	public function clearRecent(): DataResponse {
		$this->recentFiles->clear($this->userId());
		return new DataResponse([], Http::STATUS_OK);
	}

	#[NoAdminRequired]
	#[ApiRoute(verb: 'GET', url: '/api/v1/settings')]
	public function getSettings(): DataResponse {
		return new DataResponse($this->settings->get($this->userId()));
	}

	/**
	 * @param array<string, mixed> $settings subset of settings to change
	 */
	#[NoAdminRequired]
	#[ApiRoute(verb: 'PUT', url: '/api/v1/settings')]
	public function updateSettings(array $settings): DataResponse {
		return new DataResponse($this->settings->update($this->userId(), $settings));
	}
}
