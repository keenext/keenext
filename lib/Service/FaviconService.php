<?php

declare(strict_types=1);

namespace OCA\KeeNext\Service;

use OCP\AppFramework\Utility\ITimeFactory;
use OCP\Http\Client\IClient;
use OCP\Http\Client\IClientService;

/**
 * Looks up the icon of a website for an entry. The browser cannot do this itself
 * (other sites do not allow cross-origin reads), so the server fetches it. The
 * Nextcloud HTTP client refuses local addresses unless the admin allows them.
 */
final class FaviconService {
	public const MAX_ICON_BYTES = 262144;
	private const MAX_PAGE_BYTES = 524288;
	private const MAX_CANDIDATES = 5;
	/** Seconds until a server has to answer, and between two parts of its answer. */
	private const REQUEST_TIMEOUT = 8;
	/**
	 * Seconds one lookup may take over the page and all icon candidates. The request timeout
	 * alone bounds nothing: a server that keeps sending a byte every few seconds never trips
	 * it, and with up to six requests per lookup a user could tie up a PHP worker for hours
	 * per call by pointing an entry at such a server.
	 */
	public const TIME_BUDGET = 20;

	public function __construct(
		private IClientService $clientService,
		private ITimeFactory $time,
	) {
	}

	/**
	 * @return array{mime: string, data: string}|null base64 image data, or null if the site has no usable icon
	 * @throws \InvalidArgumentException if $pageUrl is not an http(s) address
	 */
	public function find(string $pageUrl): ?array {
		$parts = parse_url($pageUrl);
		if ($parts === false || !in_array($parts['scheme'] ?? '', ['http', 'https'], true) || ($parts['host'] ?? '') === '') {
			throw new \InvalidArgumentException('Not an http(s) address');
		}

		$client = $this->clientService->newClient();
		$deadline = $this->now() + (float)self::TIME_BUDGET;
		$candidates = [];
		$page = $this->fetch($client, $pageUrl, self::MAX_PAGE_BYTES, $deadline);
		if ($page !== null) {
			$candidates = $this->linkedIcons($page, $pageUrl);
		}
		$candidates[] = $this->origin($parts) . '/favicon.ico';

		foreach (array_slice(array_values(array_unique($candidates)), 0, self::MAX_CANDIDATES) as $candidate) {
			$body = $this->fetch($client, $candidate, self::MAX_ICON_BYTES, $deadline);
			$mime = $body === null ? null : self::imageType($body);
			if ($body !== null && $mime !== null) {
				return ['mime' => $mime, 'data' => base64_encode($body)];
			}
		}
		return null;
	}

	/**
	 * Image type by content: servers often label icons wrongly or send an HTML error page with status 200.
	 */
	public static function imageType(string $bytes): ?string {
		return match (true) {
			str_starts_with($bytes, "\x89PNG\r\n\x1a\n") => 'image/png',
			str_starts_with($bytes, "\x00\x00\x01\x00") => 'image/x-icon',
			str_starts_with($bytes, 'GIF87a'), str_starts_with($bytes, 'GIF89a') => 'image/gif',
			str_starts_with($bytes, "\xff\xd8\xff") => 'image/jpeg',
			str_starts_with($bytes, 'RIFF') && substr($bytes, 8, 4) === 'WEBP' => 'image/webp',
			preg_match('/^\s*(<\?xml[^>]*>\s*)?(<!--.*?-->\s*)*<svg[\s>]/is', substr($bytes, 0, 2048)) === 1 => 'image/svg+xml',
			default => null,
		};
	}

	/**
	 * Icons announced by the page, regular icons before touch icons.
	 *
	 * @return list<string>
	 */
	private function linkedIcons(string $html, string $pageUrl): array {
		if ($html === '') {
			return [];
		}
		$previous = libxml_use_internal_errors(true);
		$document = new \DOMDocument();
		$document->loadHTML($html);
		libxml_clear_errors();
		libxml_use_internal_errors($previous);

		$regular = [];
		$touch = [];
		foreach ($document->getElementsByTagName('link') as $link) {
			$rel = array_map('strtolower', preg_split('/\s+/', trim($link->getAttribute('rel'))) ?: []);
			$href = trim($link->getAttribute('href'));
			if ($href === '') {
				continue;
			}
			$resolved = self::resolve($pageUrl, $href);
			if ($resolved === null) {
				continue;
			}
			if (in_array('icon', $rel, true)) {
				$regular[] = $resolved;
			} elseif (in_array('apple-touch-icon', $rel, true)) {
				$touch[] = $resolved;
			}
		}
		return [...$regular, ...$touch];
	}

	/**
	 * @param array<string, mixed> $parts result of parse_url
	 */
	private function origin(array $parts): string {
		return $parts['scheme'] . '://' . $parts['host'] . (isset($parts['port']) ? ':' . $parts['port'] : '');
	}

	/**
	 * Absolute http(s) address of $href as seen from the page at $base.
	 */
	public static function resolve(string $base, string $href): ?string {
		$parts = parse_url($base);
		if ($parts === false || !isset($parts['scheme'], $parts['host'])) {
			return null;
		}
		$origin = $parts['scheme'] . '://' . $parts['host'] . (isset($parts['port']) ? ':' . $parts['port'] : '');

		if (preg_match('#^[a-z][a-z0-9+.-]*:#i', $href) === 1) {
			return preg_match('#^https?://#i', $href) === 1 ? $href : null;
		}
		if (str_starts_with($href, '//')) {
			return $parts['scheme'] . ':' . $href;
		}
		if (str_starts_with($href, '/')) {
			return $origin . $href;
		}

		$path = $parts['path'] ?? '/';
		$directory = substr($path, 0, (int)strrpos($path, '/') + 1);
		$segments = [];
		foreach (explode('/', $directory . $href) as $segment) {
			if ($segment === '..') {
				array_pop($segments);
			} elseif ($segment !== '.') {
				$segments[] = $segment;
			}
		}
		return $origin . implode('/', $segments);
	}

	private function now(): float {
		return (float)$this->time->now()->format('U.u');
	}

	/**
	 * Body of a successful response, or null on any failure, when it exceeds $limit bytes or
	 * when it is not complete by $deadline.
	 */
	private function fetch(IClient $client, string $url, int $limit, float $deadline): ?string {
		$remaining = $deadline - $this->now();
		if ($remaining <= 0) {
			return null;
		}
		$timeout = (int)min(self::REQUEST_TIMEOUT, ceil($remaining));
		try {
			$response = $client->get($url, [
				'timeout' => $timeout,
				'stream' => true,
				'headers' => ['Accept' => 'image/*,text/html;q=0.8,*/*;q=0.5'],
				'allow_redirects' => ['max' => 5, 'protocols' => ['http', 'https']],
			]);
			if ($response->getStatusCode() !== 200) {
				return null;
			}
			$stream = $response->getBody();
			if (!is_resource($stream)) {
				return null;
			}
		} catch (\Exception) {
			return null;
		}
		try {
			// Has no effect on streams that are not sockets; those do not stall either.
			stream_set_timeout($stream, $timeout);
			return $this->read($stream, $limit, $deadline);
		} finally {
			fclose($stream);
		}
	}

	/**
	 * @param resource $stream
	 */
	private function read($stream, int $limit, float $deadline): ?string {
		$body = '';
		while (!feof($stream)) {
			if ($this->now() >= $deadline) {
				return null;
			}
			$chunk = fread($stream, 8192);
			if ($chunk === false) {
				return null;
			}
			if ($chunk === '') {
				if (feof($stream)) {
					break;
				}
				// Nothing arrived within the timeout: an answer cut short is not an icon.
				return null;
			}
			$body .= $chunk;
			if (strlen($body) > $limit) {
				return null;
			}
		}
		return $body;
	}
}
