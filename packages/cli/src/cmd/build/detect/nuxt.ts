/**
 * Nuxt framework detector.
 *
 * Detects Nuxt 3 projects by:
 * 1. Presence of nuxt.config.* files
 * 2. 'nuxt' in dependencies
 *
 * Nuxt 3 uses Nitro under the hood and outputs to .output/.
 */

import type { FrameworkDetector, DetectedFramework } from './types';
import { findFile, hasDependency, getDependencyVersion, detectPackageManager } from './util';

const CONFIG_FILES = ['nuxt.config.ts', 'nuxt.config.js', 'nuxt.config.mjs'];

export const nuxtDetector: FrameworkDetector = {
	name: 'nuxt',
	priority: 10,

	async detect(projectDir, pkg): Promise<DetectedFramework | null> {
		const configFile = await findFile(projectDir, CONFIG_FILES);
		const hasDep = hasDependency(pkg, 'nuxt');

		if (!configFile && !hasDep) return null;

		const pm = await detectPackageManager(projectDir);
		const version = getDependencyVersion(pkg, 'nuxt')?.replace(/[\^~>=<]*/g, '') ?? undefined;

		const buildCommand = pkg.scripts?.build ?? 'nuxt build';

		// Nuxt 3 with Nitro always produces a server
		return {
			name: 'nuxt',
			version,
			runtime: 'node',
			packageManager: pm,
			mode: 'server',
			buildCommand,
			buildOutput: '.output',
			startCommand: 'node .output/server/index.mjs',
			serverEntry: 'server/index.mjs',
			staticDir: '.output/public',
			port: 3000,
			confidence: configFile ? 'high' : 'medium',
		};
	},
};
