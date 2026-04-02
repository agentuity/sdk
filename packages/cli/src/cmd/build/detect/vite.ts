/**
 * Vite framework detector.
 *
 * Detects Vite projects (SPA or SSR) by:
 * 1. Presence of vite.config.* files
 * 2. 'vite' in dependencies
 *
 * Distinguishes between SPA (static output) and SSR (server output) modes.
 * Also handles Vite-based meta-frameworks that aren't covered by specific detectors.
 */

import { join } from 'node:path';
import type { FrameworkDetector, DetectedFramework } from './types';
import { findFile, hasDependency, getDependencyVersion, detectPackageManager } from './util';

const CONFIG_FILES = ['vite.config.ts', 'vite.config.js', 'vite.config.mjs', 'vite.config.cjs'];

export const viteDetector: FrameworkDetector = {
	name: 'vite',
	priority: 50, // Lower priority — check specific frameworks first

	async detect(projectDir, pkg): Promise<DetectedFramework | null> {
		const configFile = await findFile(projectDir, CONFIG_FILES);
		const hasDep = hasDependency(pkg, 'vite');

		if (!configFile && !hasDep) return null;

		const pm = await detectPackageManager(projectDir);
		const version = getDependencyVersion(pkg, 'vite')?.replace(/[\^~>=<]*/g, '') ?? undefined;

		// Check if this is an SSR app by looking for server entry points
		const hasSSR = await detectSSR(projectDir);

		const buildCommand = pkg.scripts?.build ?? 'vite build';

		if (hasSSR) {
			return {
				name: 'vite',
				version,
				runtime: 'node',
				packageManager: pm,
				mode: 'server',
				buildCommand,
				buildOutput: 'dist',
				startCommand: 'node dist/server/entry.mjs',
				serverEntry: 'server/entry.mjs',
				staticDir: 'dist/client',
				port: 3000,
				confidence: configFile ? 'high' : 'medium',
			};
		}

		// SPA mode — static files only
		return {
			name: 'vite',
			version,
			runtime: 'node',
			packageManager: pm,
			mode: 'static',
			buildCommand,
			buildOutput: 'dist',
			staticDir: 'dist',
			port: 3000,
			confidence: configFile ? 'high' : 'medium',
		};
	},
};

/**
 * Detect if a Vite project uses SSR by checking for common patterns.
 */
async function detectSSR(projectDir: string): Promise<boolean> {
	// Check for common SSR entry points
	const ssrEntries = [
		'src/entry-server.tsx',
		'src/entry-server.ts',
		'src/entry-server.jsx',
		'src/entry-server.js',
		'src/server.ts',
		'src/server.tsx',
		'server.ts',
		'server.tsx',
	];

	for (const entry of ssrEntries) {
		if (await Bun.file(join(projectDir, entry)).exists()) {
			return true;
		}
	}

	return false;
}
