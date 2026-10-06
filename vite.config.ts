import { createAppConfig } from '@nextcloud/vite-config'
import { fileURLToPath } from 'node:url'

const emptyModule = fileURLToPath(new URL('./src/shims/empty.ts', import.meta.url))

export default createAppConfig({
	main: 'src/main.ts',
	init: 'src/init.ts',
}, {
	appName: 'nextkeeweb',
	// kdbxweb only touches node `crypto` / `@xmldom/xmldom` when WebCrypto or
	// DOMParser are missing, which never happens in the browser.
	nodePolyfills: false,
	extractLicenseInformation: false,
	config: {
		resolve: {
			alias: {
				'@': fileURLToPath(new URL('./src', import.meta.url)),
				crypto: emptyModule,
				'@xmldom/xmldom': emptyModule,
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
