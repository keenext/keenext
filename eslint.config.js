import { recommended } from '@nextcloud/eslint-config'

export default [
	...recommended,
	{
		ignores: ['js/', 'css/', 'vendor/', 'test-results/', 'tests/fixtures/'],
	},
	{
		// Comments are written where they explain something the code does not show; no mandatory JSDoc.
		rules: {
			'jsdoc/require-jsdoc': 'off',
			'jsdoc/require-param': 'off',
			'jsdoc/require-param-description': 'off',
			'jsdoc/require-param-type': 'off',
			'jsdoc/require-returns': 'off',
			'jsdoc/require-returns-description': 'off',
		},
	},
]
