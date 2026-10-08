<?php

declare(strict_types=1);

namespace OCA\KeeNext\Service;

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

	public function __construct(
		private IClientService $clientService,
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
		$candidates = [];
		$page = $this->fetch($client, $pageUrl, self::MAX_PAGE_BYTES);
		if ($page !== null) {
			$candidates = $this->linkedIcons($page, $pageUrl);
		}
		$candidates[] = $this->origin($parts) . '/favicon.ico';

		foreach (array_slice(array_values(array_unique($candidates)), 0, self::MAX_CANDIDATES) as $candidate) {
			$body = $this->fetch($client, $candidate, self::MAX_ICON_BYTES);
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

	/**
	 * Body of a successful response, or null on any failure or when it exceeds $limit bytes.
	 */
	private function fetch(IClient $client, string $url, int $limit): ?string {
		try {
			$response = $client->get($url, [
				'timeout' => 8,
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
			$body = stream_get_contents($stream, $limit + 1);
			fclose($stream);
		} catch (\Exception) {
			return null;
		}
		return $body === false || strlen($body) > $limit ? null : $body;
	}
}
