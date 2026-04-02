/**
 * SvelteKit framework detector.
 *
 * Detects SvelteKit projects by:
 * 1. Presence of svelte.config.* files
 * 2. '@sveltejs/kit' in dependencies
 *
 * Assumes adapter-node for server deployments.
 */

import type { FrameworkDetector, DetectedFramework } from './types';
import { findFile, hasDependency, getDependencyVersion, detectPackageManager } from './util';

const CONFIG_FILES = ['svelte.config.js', 'svelte.config.ts', 'svelte.config.mjs'];

export const sveltekitDetector: FrameworkDetector = {
	name: 'sveltekit',
	priority: 15,

	async detect(projectDir, pkg): Promise<DetectedFramework | null> {
		const configFile = await findFile(projectDir, CONFIG_FILES);
		const hasDep = hasDependency(pkg, '@sveltejs/kit');

		if (!configFile && !hasDep) return null;

		const pm = await detectPackageManager(projectDir);
		const version =
			getDependencyVersion(pkg, '@sveltejs/kit')?.replace(/[\^~>=<]*/g, '') ?? undefined;

		// Detect adapter — if adapter-static is used, it's a static site
		const hasStaticAdapter = hasDependency(pkg, '@sveltejs/adapter-static');
		const buildCommand = pkg.scripts?.build ?? 'vite build';

		if (hasStaticAdapter) {
			return {
				name: 'sveltekit',
				version,
				runtime: 'node',
				packageManager: pm,
				mode: 'static',
				buildCommand,
				buildOutput: 'build',
				staticDir: 'build',
				confidence: configFile ? 'high' : 'medium',
			};
		}

		return {
			name: 'sveltekit',
			version,
			runtime: 'node',
			packageManager: pm,
			mode: 'server',
			buildCommand,
			buildOutput: 'build',
			startCommand: 'node build/index.js',
			serverEntry: 'index.js',
			port: 3000,
			confidence: configFile ? 'high' : 'medium',
		};
	},
};
