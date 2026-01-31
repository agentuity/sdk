/**
 * Vite plugin to fix incorrect public asset paths
 *
 * Developers sometimes accidentally use source paths or relative paths instead
 * of the correct absolute root path. This plugin:
 *
 * 1. During build: Rewrites all public asset paths to root paths (/)
 * 2. During dev: Warns about incorrect paths so developers can fix them
 *
 * Patterns handled (all rewritten to root path in production):
 * - '/src/web/public/foo.svg'  → '/foo.svg'
 * - './src/web/public/foo.svg' → '/foo.svg'
 * - 'src/web/public/foo.svg'   → '/foo.svg'
 * - './public/foo.svg'         → '/foo.svg'
 * - '/public/foo.svg'          → '/foo.svg'
 *
 * Vite's base config then rewrites these to CDN URLs (e.g., https://cdn.example.com/deploy/client/foo.svg)
 */

import type { Plugin } from 'vite';

export interface PublicAssetPathPluginOptions {
	/** Whether to show warnings in dev mode (default: true) */
	warnInDev?: boolean;
	/** CDN base URL for production builds (e.g., 'https://cdn.agentuity.com/{deploymentId}/client/') */
	cdnBaseUrl?: string;
}

interface PathPattern {
	regex: RegExp;
	description: string;
}

/**
 * Create fresh regex instances for each transform call
 * (RegExp with global flag maintains state via lastIndex)
 */
function createPatterns(): PathPattern[] {
	return [
		// '/src/web/public/...' or './src/web/public/...' or 'src/web/public/...'
		{
			regex: /(['"`])(?:\.?\/)?src\/web\/public\//g,
			description: 'src/web/public/',
		},
		// './public/...' (relative public path - should be absolute)
		{
			regex: /(['"`])\.\/public\//g,
			description: './public/',
		},
	];
}

/**
 * Vite plugin that fixes public asset paths and rewrites to CDN URLs
 *
 * Rewrites all public asset paths to CDN URLs in production, or root paths
 * if no CDN base URL is provided.
 *
 * @example
 * // In vite config:
 * plugins: [publicAssetPathPlugin({ cdnBaseUrl: 'https://cdn.example.com/deploy/client/' })]
 *
 * // Transforms in production with CDN:
 * // '/src/web/public/logo.svg'  → 'https://cdn.example.com/deploy/client/logo.svg'
 * // './src/web/public/logo.svg' → 'https://cdn.example.com/deploy/client/logo.svg'
 * // '/public/logo.svg'          → 'https://cdn.example.com/deploy/client/logo.svg'
 *
 * // Transforms in production without CDN:
 * // '/src/web/public/logo.svg'  → '/logo.svg'
 * // '/public/logo.svg'          → '/logo.svg'
 */
export function publicAssetPathPlugin(options: PublicAssetPathPluginOptions = {}): Plugin {
	const { warnInDev = true, cdnBaseUrl } = options;

	let isDev = false;
	const warnedFiles = new Map<string, Set<string>>(); // file -> set of patterns warned

	return {
		name: 'agentuity:public-asset-path',

		configResolved(config) {
			isDev = config.command === 'serve';
		},

		transform(code, id) {
			// Only transform files in src/web (browser code)
			if (!id.includes('/src/web/') && !id.includes('\\src\\web\\')) {
				return null;
			}

			// Quick check: does the code contain any patterns we care about?
			const hasIncorrectPaths = code.includes('src/web/public/') || code.includes('./public/');
			const hasPublicPaths = code.includes('/public/');

			if (!hasIncorrectPaths && !hasPublicPaths) {
				return null;
			}

			// In dev mode, optionally warn about incorrect paths but don't transform
			if (isDev) {
				if (warnInDev && hasIncorrectPaths) {
					const patterns = createPatterns();
					const foundPatterns: string[] = [];

					for (const { regex, description } of patterns) {
						if (regex.test(code)) {
							foundPatterns.push(description);
						}
					}

					if (foundPatterns.length > 0) {
						const fileWarnings = warnedFiles.get(id) || new Set();
						const newWarnings = foundPatterns.filter((p) => !fileWarnings.has(p));

						if (newWarnings.length > 0) {
							for (const p of newWarnings) {
								fileWarnings.add(p);
							}
							warnedFiles.set(id, fileWarnings);

							this.warn(
								`Found incorrect asset path(s) in ${id}:\n` +
									newWarnings.map((p) => `  - '${p}' should be '/public/'`).join('\n') +
									`\nUse absolute '/public/...' paths for production compatibility.`
							);
						}
					}
				}
				// In dev mode, never transform - Vite serves from source paths
				return null;
			}

		// Build mode: transform paths
		let transformed = code;

		// Determine target URL: CDN base if provided, otherwise root
		const targetBase = cdnBaseUrl ? (cdnBaseUrl.endsWith('/') ? cdnBaseUrl : `${cdnBaseUrl}/`) : '/';

		// First, fix incorrect source paths (src/web/public/, ./public/) → targetBase
		if (hasIncorrectPaths) {
			const patterns = createPatterns();
			for (const { regex } of patterns) {
				const replaceRegex = new RegExp(regex.source, regex.flags);
				transformed = transformed.replace(replaceRegex, `$1${targetBase}`);
			}
		}

		// Then, rewrite /public/foo → {targetBase}foo
		if (hasPublicPaths) {
			// Match '/public/...' paths in strings (single, double, or backtick quotes)
			// Captures: $1 = quote char, $2 = path after /public/
			const publicPathRegex = /(['"`])\/public\/([^'"`\s]+)/g;
			transformed = transformed.replace(publicPathRegex, `$1${targetBase}$2`);
		}

			// Return transformed code if changed
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
