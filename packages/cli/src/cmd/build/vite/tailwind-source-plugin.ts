/**
 * Vite plugin to fix Tailwind v4 oxide scanner hang in containers
 *
 * The Tailwind v4 oxide scanner (native Rust binary) can hang or fail when
 * scanning the filesystem in containerized environments. Adding source(none)
 * to @import "tailwindcss" disables the oxide filesystem scanner, and an
 * explicit @source directive pointing at the project's src/ directory tells
 * Tailwind exactly where to find utility classes.
 *
 * @see https://github.com/tailwindlabs/tailwindcss/discussions/19661
 * @see https://tailwindcss.com/docs/detecting-classes-in-source-files
 */

import { dirname, join, relative, sep } from 'node:path';
import type { Plugin } from 'vite';

export function tailwindSourcePlugin(): Plugin {
	let root: string;

	return {
		name: 'agentuity:tailwind-source',
		enforce: 'pre',

		configResolved(config) {
			root = config.root;
		},

		transform(code, id) {
			// Only transform CSS files
			if (!id.endsWith('.css')) {
				return null;
			}

			// Check if the file contains @import "tailwindcss" (with either quote type)
			if (!/@import\s+["']tailwindcss["']/.test(code)) {
				return null;
			}

			// Compute relative path from CSS file to project's src/ directory
			const cssDir = dirname(id);
			const srcDir = join(root, 'src');
			let relPath = relative(cssDir, srcDir).split(sep).join('/');
			if (relPath === '') {
				relPath = '.';
			} else if (!relPath.startsWith('.')) {
				relPath = './' + relPath;
			}

			// Transform @import "tailwindcss" → @import "tailwindcss" source(none)
			// and add explicit @source so Tailwind knows where to scan for classes.
			// Does NOT transform if source() is already specified.
			const transformed = code.replace(
				/@import\s+(["'])tailwindcss\1([^;]*);/g,
				(match, quote, rest) => {
					// If source() is already present, don't modify
					if (/source\s*\(/.test(rest)) {
						return match;
					}
					return `@import ${quote}tailwindcss${quote}${rest} source(none);\n@source "${relPath}";`;
				}
			);

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
