<?php

declare(strict_types=1);

namespace OCA\KeeNext\Tests\Service;

use OCA\KeeNext\Service\FaviconService;
use OCP\Http\Client\IClient;
use OCP\Http\Client\IClientService;
use OCP\Http\Client\IResponse;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

class FaviconServiceTest extends TestCase {
	private const PNG = "\x89PNG\r\n\x1a\n" . 'pixels';

	/** @var list<string> */
	private array $requested = [];

	/**
	 * @param array<string, string|int> $responses body by URL, or a status code for a failed response
	 */
	private function service(array $responses): FaviconService {
		$client = $this->createMock(IClient::class);
		$client->method('get')->willReturnCallback(function (string $url) use ($responses): IResponse {
			$this->requested[] = $url;
			$answer = $responses[$url] ?? 404;
			if ($answer === 'throw') {
				throw new \RuntimeException('connection refused');
			}
			$response = $this->createMock(IResponse::class);
			$response->method('getStatusCode')->willReturn(is_int($answer) ? $answer : 200);
			$stream = fopen('php://memory', 'r+');
			fwrite($stream, is_int($answer) ? '' : $answer);
			rewind($stream);
			$response->method('getBody')->willReturn($stream);
			return $response;
		});
		$clients = $this->createMock(IClientService::class);
		$clients->method('newClient')->willReturn($client);
		return new FaviconService($clients);
	}

	public function testUsesTheIconTheSiteAnnounces(): void {
		$service = $this->service([
			'https://example.org/login' => '<html><head><link rel="shortcut icon" href="/static/icon.png"></head></html>',
			'https://example.org/static/icon.png' => self::PNG,
		]);

		$icon = $service->find('https://example.org/login');

		$this->assertSame('image/png', $icon['mime'] ?? null);
		$this->assertSame(self::PNG, base64_decode($icon['data'] ?? ''));
	}

	public function testPrefersRegularIconsOverTouchIcons(): void {
		$service = $this->service([
			'https://example.org/' => '<link rel="apple-touch-icon" href="touch.png"><link rel="icon" href="small.png">',
			'https://example.org/touch.png' => self::PNG . 'touch',
			'https://example.org/small.png' => self::PNG . 'small',
		]);

		$icon = $service->find('https://example.org/');

		$this->assertSame(self::PNG . 'small', base64_decode($icon['data'] ?? ''));
	}

	public function testFallsBackToFaviconIco(): void {
		$service = $this->service([
			'https://example.org/app/' => '<html></html>',
			'https://example.org/favicon.ico' => "\x00\x00\x01\x00icon",
		]);

		$icon = $service->find('https://example.org/app/');

		$this->assertSame('image/x-icon', $icon['mime'] ?? null);
	}

	public function testSkipsAnswersThatAreNotImages(): void {
		$service = $this->service([
			'https://example.org/' => '<link rel="icon" href="/broken.png">',
			'https://example.org/broken.png' => '<html>Not found</html>',
			'https://example.org/favicon.ico' => self::PNG,
		]);

		$icon = $service->find('https://example.org/');

		$this->assertSame('image/png', $icon['mime'] ?? null);
		$this->assertContains('https://example.org/broken.png', $this->requested);
	}

	public function testFindsNothingWhenTheSiteIsDownOrHasNoIcon(): void {
		$this->assertNull($this->service(['https://down.example/' => 'throw'])->find('https://down.example/'));
		$this->assertNull($this->service(['https://example.org/' => '<html></html>'])->find('https://example.org/'));
	}

	public function testRejectsIconsAboveTheSizeLimit(): void {
		$service = $this->service([
			'https://example.org/' => '<link rel="icon" href="/big.png">',
			'https://example.org/big.png' => self::PNG . str_repeat('x', FaviconService::MAX_ICON_BYTES),
		]);

		$this->assertNull($service->find('https://example.org/'));
	}

	public function testOnlyHttpAddressesAreFetched(): void {
		$this->expectException(\InvalidArgumentException::class);

		$this->service([])->find('file:///etc/passwd');
	}

	#[DataProvider('addresses')]
	public function testResolvesRelativeAddresses(string $href, ?string $expected): void {
		$this->assertSame($expected, FaviconService::resolve('https://example.org:8443/a/b/page.html?x=1', $href));
	}

	/**
	 * @return array<string, array{string, ?string}>
	 */
	public static function addresses(): array {
		return [
			'absolute' => ['http://cdn.example/i.png', 'http://cdn.example/i.png'],
			'protocol relative' => ['//cdn.example/i.png', 'https://cdn.example/i.png'],
			'root relative' => ['/i.png', 'https://example.org:8443/i.png'],
			'relative' => ['i.png', 'https://example.org:8443/a/b/i.png'],
			'parent' => ['../i.png', 'https://example.org:8443/a/i.png'],
			'data URI' => ['data:image/png;base64,AAAA', null],
			'javascript' => ['javascript:alert(1)', null],
		];
	}

	public function testRecognisesImageTypesByContent(): void {
		$this->assertSame('image/svg+xml', FaviconService::imageType('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"/>'));
		$this->assertSame('image/jpeg', FaviconService::imageType("\xff\xd8\xff\xe0data"));
		$this->assertSame('image/webp', FaviconService::imageType('RIFF1234WEBPdata'));
		$this->assertNull(FaviconService::imageType('<!doctype html><html></html>'));
	}
}
