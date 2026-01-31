/**
 * Vite plugin to fix incorrect public asset paths
 *
 * Developers sometimes accidentally use source paths or relative paths instead
 * of the correct absolute production path '/public/...'. This plugin:
 *
 * 1. During build: Rewrites incorrect paths to '/public/*' in the bundle
 * 2. During dev: Warns about incorrect paths so developers can fix them
 *
 * Patterns handled:
 * - '/src/web/public/...'  → '/public/...'
 * - './src/web/public/...' → '/public/...'
 * - 'src/web/public/...'   → '/public/...'
 * - './public/...'         → '/public/...'
 */

import type { Plugin } from 'vite';

export interface PublicAssetPathPluginOptions {
	/** Whether to show warnings in dev mode (default: true) */
	warnInDev?: boolean;
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
 * Vite plugin that fixes incorrect public asset paths
 *
 * @example
 * // In vite config:
 * plugins: [publicAssetPathPlugin()]
 *
 * // Transforms:
 * // '/src/web/public/logo.svg'  → '/public/logo.svg'
 * // './src/web/public/logo.svg' → '/public/logo.svg'
 * // './public/logo.svg'         → '/public/logo.svg'
 */
export function publicAssetPathPlugin(options: PublicAssetPathPluginOptions = {}): Plugin {
	const { warnInDev = true } = options;

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

			if (!hasIncorrectPaths) {
				return null;
			}

			// Create fresh patterns for this transform
			const patterns = createPatterns();

			// Track which patterns were found for warnings
			const foundPatterns: string[] = [];
			let transformed = code;

			for (const { regex, description } of patterns) {
				if (regex.test(transformed)) {
					foundPatterns.push(description);

					// Create a fresh regex for the replacement (test() consumed the previous one)
					const replaceRegex = new RegExp(regex.source, regex.flags);
					transformed = transformed.replace(replaceRegex, '$1/public/');
				}
			}

			// In dev mode, optionally warn but don't transform (Vite serves from source paths)
			if (isDev) {
				if (warnInDev && foundPatterns.length > 0) {
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
				// In dev mode, never transform - Vite serves from source paths
				return null;
			}

			// In build mode, return transformed code if changed
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
