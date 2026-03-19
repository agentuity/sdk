/**
 * Vite plugin to fix Tailwind v4 oxide scanner hang in containers
 *
 * The Tailwind v4 oxide scanner (native Rust binary) can hang or fail when
 * scanning the filesystem in containerized environments. Adding source(none)
 * to @import "tailwindcss" disables the oxide filesystem scanner while still
 * allowing @tailwindcss/vite to detect class usage through Vite's module graph.
 *
 * Only applies during production builds (apply: 'build'). In dev mode, the
 * oxide scanner runs natively and source(none) would prevent Tailwind from
 * discovering utility classes since Vite's module graph is built lazily.
 *
 * @see https://github.com/tailwindlabs/tailwindcss/discussions/19661
 */

import type { Plugin } from 'vite';

export function tailwindSourcePlugin(): Plugin {
	return {
		name: 'agentuity:tailwind-source',
		enforce: 'pre',
		apply: 'build',

		transform(code, id) {
			// Only transform CSS files
			if (!id.endsWith('.css')) {
				return null;
			}

			// Check if the file contains @import "tailwindcss" (with either quote type)
			if (!/@import\s+["']tailwindcss["']/.test(code)) {
				return null;
			}

			// Transform @import "tailwindcss" → @import "tailwindcss" source(none)
			// Handles both quote styles and preserves any other directives on the same statement
			// Does NOT transform if source() is already specified
			const transformed = code.replace(
				/@import\s+(["'])tailwindcss\1([^;]*);/g,
				(match, quote, rest) => {
					// If source() is already present, don't modify
					if (/source\s*\(/.test(rest)) {
						return match;
					}
					return `@import ${quote}tailwindcss${quote}${rest} source(none);`;
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
