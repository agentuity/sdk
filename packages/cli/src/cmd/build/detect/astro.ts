/**
 * Astro framework detector.
 *
 * Detects Astro projects by:
 * 1. Presence of astro.config.* files
 * 2. 'astro' in dependencies
 *
 * Handles both static (default) and SSR (with adapter) modes.
 */

import type { FrameworkDetector, DetectedFramework } from './types';
import { findFile, hasDependency, getDependencyVersion, detectPackageManager } from './util';

const CONFIG_FILES = ['astro.config.ts', 'astro.config.mjs', 'astro.config.js', 'astro.config.cjs'];

export const astroDetector: FrameworkDetector = {
	name: 'astro',
	priority: 15,

	async detect(projectDir, pkg): Promise<DetectedFramework | null> {
		const configFile = await findFile(projectDir, CONFIG_FILES);
		const hasDep = hasDependency(pkg, 'astro');

		if (!configFile && !hasDep) return null;

		const pm = await detectPackageManager(projectDir);
		const version = getDependencyVersion(pkg, 'astro')?.replace(/[\^~>=<]*/g, '') ?? undefined;

		// Check for SSR adapter
		const hasNodeAdapter = hasDependency(pkg, '@astrojs/node');
		const buildCommand = pkg.scripts?.build ?? 'astro build';

		if (hasNodeAdapter) {
			return {
				name: 'astro',
				version,
				runtime: 'node',
				packageManager: pm,
				mode: 'server',
				buildCommand,
				buildOutput: 'dist',
				startCommand: 'node dist/server/entry.mjs',
				serverEntry: 'server/entry.mjs',
				staticDir: 'dist/client',
				port: 4321,
				confidence: configFile ? 'high' : 'medium',
			};
		}

		// Default: static site
		return {
			name: 'astro',
			version,
			runtime: 'node',
			packageManager: pm,
			mode: 'static',
			buildCommand,
			buildOutput: 'dist',
			staticDir: 'dist',
			confidence: configFile ? 'high' : 'medium',
		};
	},
};
