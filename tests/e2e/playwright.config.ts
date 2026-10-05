import { defineConfig } from '@playwright/test'

/**
 * End-to-end tests against the docker-compose Nextcloud (see README).
 * Uses the locally installed Chrome; no browser download needed.
 */
export default defineConfig({
	testDir: '.',
	globalSetup: './global-setup.ts',
	timeout: 90_000,
	expect: { timeout: 15_000 },
	fullyParallel: false,
	workers: 1,
	reporter: [['list']],
	outputDir: '../../test-results',
	use: {
		baseURL: process.env.NEXTCLOUD_URL ?? 'http://localhost:8091',
		channel: 'chrome',
		headless: true,
		viewport: { width: 1400, height: 900 },
		screenshot: 'only-on-failure',
		trace: 'retain-on-failure',
		permissions: ['clipboard-read', 'clipboard-write'],
		locale: 'en-US',
	},
})
