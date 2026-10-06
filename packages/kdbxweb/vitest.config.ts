import { defineConfig } from 'vitest/config'

// Upstream's mocha/expect.js suite, run with vitest globals; see test/setup.ts.
export default defineConfig({
	test: {
		globals: true,
		environment: 'node',
		include: ['test/**/*.spec.ts'],
		setupFiles: ['test/setup.ts'],
		testTimeout: 30_000,
	},
})
