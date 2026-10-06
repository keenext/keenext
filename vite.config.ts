import { createAppConfig } from '@nextcloud/vite-config'
import { fileURLToPath } from 'node:url'

export default createAppConfig({
	main: 'src/main.ts',
	init: 'src/init.ts',
}, {
	appName: 'keenext',
	nodePolyfills: false,
	extractLicenseInformation: false,
	config: {
		resolve: {
			alias: {
				'@': fileURLToPath(new URL('./src', import.meta.url)),
				// The fork is bundled from source; its dist/ build is for Node scripts and type declarations.
				kdbxweb: fileURLToPath(new URL('./packages/kdbxweb/lib/index.ts', import.meta.url)),
			},
		},
		worker: {
			format: 'es',
			rollupOptions: {
				output: {
					entryFileNames: 'js/[name]-[hash].mjs',
				},
			},
		},
	},
})
