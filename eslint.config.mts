import js from '@eslint/js';
import json from '@eslint/json';
import pluginReact from 'eslint-plugin-react';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default [
	{
		ignores: [
			'**/dist/**',
			'**/node_modules/**',
			'**/templates/**',
			'**/.agentuity/**',
			'**/.test-projects/**',
			'**/test-interop/go-common/**',
			'**/*.json',
			'!**/package.json',
			'**/ai-elements/**',
			'**/ui/**',
		],
	},
	{
		files: ['**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
	},
	{
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node,
				Bun: 'readonly',
			},
		},
	},
	js.configs.recommended,
	...tseslint.configs.recommended,
	{
		rules: {
			'@typescript-eslint/no-unused-vars': [
				'error',
				{
					argsIgnorePattern: '^_',
					varsIgnorePattern: '^_',
					caughtErrorsIgnorePattern: '^_',
				},
			],
		},
	},
	{
		...pluginReact.configs.flat.recommended,
		settings: {
			react: {
				version: 'detect',
			},
		},
		rules: {
			...pluginReact.configs.flat.recommended.rules,
			'react/react-in-jsx-scope': 'off',
		},
	},
	{
		files: ['**/*.json'],
		ignores: ['**/package.json', '**/tsconfig.json', '**/tsconfig.*.json'],
		...json.configs.recommended,
	},
];
