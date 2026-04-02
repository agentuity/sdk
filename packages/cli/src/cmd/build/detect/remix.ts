/**
 * Remix framework detector.
 *
 * Detects Remix projects by:
 * 1. '@remix-run/node' or '@remix-run/react' in dependencies
 * 2. Presence of remix.config.* files (Remix v1) or vite.config with Remix plugin
 *
 * Remix v2+ uses Vite as the build tool, but we detect it specifically
 * because the output structure and start command differ from plain Vite.
 */

import type { FrameworkDetector, DetectedFramework } from './types';
import {
	findFile,
	hasDependencyMatching,
	getDependencyVersion,
	detectPackageManager,
} from './util';

const CONFIG_FILES = ['remix.config.js', 'remix.config.ts', 'remix.config.mjs'];

export const remixDetector: FrameworkDetector = {
	name: 'remix',
	priority: 12, // Before generic vite detector

	async detect(projectDir, pkg): Promise<DetectedFramework | null> {
		const configFile = await findFile(projectDir, CONFIG_FILES);
		const hasRemixDep = hasDependencyMatching(pkg, /^@remix-run\//);

		if (!configFile && !hasRemixDep) return null;

		const pm = await detectPackageManager(projectDir);
		const version =
			getDependencyVersion(pkg, '@remix-run/node')?.replace(/[\^~>=<]*/g, '') ??
			getDependencyVersion(pkg, '@remix-run/react')?.replace(/[\^~>=<]*/g, '') ??
			undefined;

		const buildCommand = pkg.scripts?.build ?? 'remix build';

		return {
			name: 'remix',
			version,
			runtime: 'node',
			packageManager: pm,
			mode: 'server',
			buildCommand,
			buildOutput: 'build',
			startCommand: 'remix-serve ./build/server/index.js',
			serverEntry: 'server/index.js',
			staticDir: 'build/client',
			port: 3000,
			confidence: configFile ? 'high' : 'medium',
		};
	},
};
