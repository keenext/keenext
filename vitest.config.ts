import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
	plugins: [vue()],
	resolve: {
		alias: {
			'@': fileURLToPath(new URL('./src', import.meta.url)),
		},
	},
	test: {
		environment: 'node',
		include: ['tests/**/*.spec.ts'],
		setupFiles: ['tests/setup.ts'],
		// Playwright tests, run with npm run test:e2e.
		exclude: ['tests/e2e/**'],
		testTimeout: 30_000,
	},
})
