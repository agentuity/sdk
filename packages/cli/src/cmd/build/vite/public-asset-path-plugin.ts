/**
 * Vite plugin to fix incorrect public asset paths
 *
 * Developers should use /public/ paths for static assets from src/web/public/.
 * In production, these paths are transformed to CDN URLs.
 *
 * This plugin:
 * 1. During build: Rewrites /public/* paths to CDN URLs
 * 2. During dev: Warns only about incorrect source paths (src/web/public/)
 *
 * Supported patterns (work in dev, rewritten to CDN in production):
 * - '/public/foo.svg'   → CDN URL (recommended)
 * - './public/foo.svg'  → CDN URL
 *
 * Incorrect patterns (warned in dev, rewritten in production):
 * - '/src/web/public/foo.svg'  → CDN URL
 * - './src/web/public/foo.svg' → CDN URL
 * - 'src/web/public/foo.svg'   → CDN URL
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
	/** Replacement template - use {base} for the target base URL */
	replacement: string;
}

/**
 * Patterns that are incorrect - reference source paths directly
 */
function createIncorrectPatterns(): PathPattern[] {
	return [
		// '/src/web/public/...' or './src/web/public/...' or 'src/web/public/...'
		{
			regex: /(['"`])(?:\.?\/)?src\/web\/public\//g,
			description: 'src/web/public/',
			replacement: '$1{base}',
		},
	];
}

/**
 * Patterns that need rewriting for production CDN
 * Both patterns simply replace the prefix while preserving the rest of the path naturally.
 */
function createPublicPatterns(): PathPattern[] {
	return [
		// './public/...' (relative public path) - replace prefix, keep rest
		{
			regex: /(['"`])\.\/public\//g,
			description: './public/',
			replacement: '$1{base}',
		},
		// '/public/...' (absolute public path) - replace prefix, keep rest
		{
			regex: /(['"`])\/public\//g,
			description: '/public/',
			replacement: '$1{base}',
		},
	];
}

/**
 * Vite plugin that fixes public asset paths and rewrites to CDN URLs
 *
 * Rewrites all public asset paths to CDN URLs in production.
 *
 * @example
 * // In vite config:
 * plugins: [publicAssetPathPlugin({ cdnBaseUrl: 'https://cdn.example.com/deploy/client/' })]
 *
 * // In code, use /public/ paths:
 * <img src="/public/logo.svg" />
 *
 * // Transforms in production:
 * // '/public/logo.svg' → 'https://cdn.example.com/deploy/client/logo.svg'
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
			const hasIncorrectSourcePaths = code.includes('src/web/public/');
			const hasPublicPaths = code.includes('/public/') || code.includes('./public/');

			if (!hasIncorrectSourcePaths && !hasPublicPaths) {
				return null;
			}

			// In dev mode, only warn about incorrect source paths (src/web/public/)
			// /public/ and ./public/ paths work correctly in dev mode
			if (isDev) {
				if (warnInDev && hasIncorrectSourcePaths) {
					const patterns = createIncorrectPatterns();
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
									`\nUse '/public/...' paths for static assets.`
							);
						}
					}
				}
				// In dev mode, never transform - Vite serves from source paths
				// and the Bun server proxies /public/* to Vite
				return null;
			}

			// Build mode: transform paths to CDN URLs
			let transformed = code;

			// Determine target URL: CDN base if provided, otherwise root
			const targetBase = cdnBaseUrl
				? cdnBaseUrl.endsWith('/')
					? cdnBaseUrl
					: `${cdnBaseUrl}/`
				: '/';

			// Transform incorrect source paths (src/web/public/) → CDN
			if (hasIncorrectSourcePaths) {
				const patterns = createIncorrectPatterns();
				for (const { regex, replacement } of patterns) {
					const replaceRegex = new RegExp(regex.source, regex.flags);
					transformed = transformed.replace(
						replaceRegex,
						replacement.replace('{base}', targetBase)
					);
				}
			}

			// Transform public paths → CDN
			if (hasPublicPaths) {
				const publicPatterns = createPublicPatterns();
				for (const { regex, replacement } of publicPatterns) {
					const replaceRegex = new RegExp(regex.source, regex.flags);
					transformed = transformed.replace(
						replaceRegex,
						replacement.replace('{base}', targetBase)
					);
				}
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
