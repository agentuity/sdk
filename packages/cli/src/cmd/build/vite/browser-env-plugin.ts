/**
 * Vite plugin to shim process.env for browser code only
 *
 * Replaces process.env with import.meta.env ONLY in files under src/web
 * to avoid breaking server-side code that needs real process.env
 */

import type { Plugin } from 'vite';

export function browserEnvPlugin(): Plugin {
	return {
		name: 'agentuity:browser-env',
		enforce: 'pre',

		transform(code, id) {
			// Only transform files in src/web (browser code)
			if (!id.includes('/src/web/') && !id.includes('\\src\\web\\')) {
				return null;
			}

			// Replace process.env with import.meta.env for browser compatibility
			const transformed = code.replace(/process\.env/g, 'import.meta.env');

			if (transformed !== code) {
				return {
					code: transformed,
					map: null,
				};
			}

			return null;
		},
	};
}
