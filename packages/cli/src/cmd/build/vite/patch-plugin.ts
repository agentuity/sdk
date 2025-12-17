/**
 * Vite Plugin for Runtime Patching
 *
 * Applies runtime patches to AI SDK packages to inject:
 * - Agentuity AI Gateway routing
 * - Telemetry enablement
 * - Environment variable guards
 *
 * This plugin uses Vite's transform hook to modify module code during bundling.
 */

import type { Plugin } from 'vite';
import type { Logger } from '../../../types';
import { generatePatches, applyPatch } from '../patch';

export interface PatchPluginOptions {
	logger: Logger;
	dev?: boolean;
}

/**
 * Create Vite plugin that patches AI SDK modules at build time
 */
export function patchPlugin(options: PatchPluginOptions): Plugin {
	const { logger } = options;
	const patches = generatePatches();

	// Log registered patches
	logger.trace('Patch plugin initialized with %d patch(es)', patches.size);
	for (const [moduleName] of patches) {
		logger.trace('  - %s', moduleName);
	}

	return {
		name: 'agentuity:patch',
		enforce: 'post', // Run after other transforms

		/**
		 * Transform hook - patches modules during bundling
		 */
		async transform(code: string, id: string) {
			// Check if this module needs patching
			for (const [moduleName, patch] of patches) {
				// Match module by package name
				const normalizedId = id.replace(/\\/g, '/');

				// Check if this file matches the patch module
				// Example: node_modules/@ai-sdk/openai/dist/index.js
				if (!normalizedId.includes(`node_modules/${moduleName}/`)) {
					continue;
				}

				// If patch specifies a filename, ensure it matches
				if (patch.filename) {
					const expectedPath = `${moduleName}/${patch.filename}`;
					if (
						!normalizedId.includes(expectedPath) &&
						!normalizedId.includes(`${expectedPath}.js`) &&
						!normalizedId.includes(`${expectedPath}.mjs`) &&
						!normalizedId.includes(`${expectedPath}.ts`)
					) {
						continue;
					}
				}

				// Apply the patch
				logger.debug('Applying patch to %s', moduleName);

				try {
					const [patchedCode] = await applyPatch(id, patch);

					// Return transformed code with source map
					return {
						code: patchedCode,
						map: null, // Could add source map generation here
					};
				} catch (error) {
					logger.warn('Failed to apply patch to %s: %s', moduleName, error);
					// Continue without patching on error
					return null;
				}
			}

			// No patch needed
			return null;
		},
	};
}
