/**
 * Next.js framework detector.
 *
 * Detects Next.js projects by:
 * 1. Presence of next.config.* files
 * 2. 'next' in dependencies
 *
 * Configures standalone output mode for optimal containerization.
 */

import type { FrameworkDetector, DetectedFramework } from './types';
import { findFile, hasDependency, getDependencyVersion, detectPackageManager } from './util';

const CONFIG_FILES = ['next.config.js', 'next.config.mjs', 'next.config.ts', 'next.config.cjs'];

export const nextjsDetector: FrameworkDetector = {
	name: 'nextjs',
	priority: 10,

	async detect(projectDir, pkg): Promise<DetectedFramework | null> {
		const configFile = await findFile(projectDir, CONFIG_FILES);
		const hasDep = hasDependency(pkg, 'next');

		if (!configFile && !hasDep) return null;

		const pm = await detectPackageManager(projectDir);
		const version = getDependencyVersion(pkg, 'next')?.replace(/[\^~>=<]*/g, '') ?? undefined;

		// Determine build command — use existing script if available, otherwise direct
		const buildCommand = pkg.scripts?.build ?? 'next build';

		return {
			name: 'nextjs',
			version,
			runtime: 'node',
			packageManager: pm,
			mode: 'server',
			buildCommand,
			buildOutput: '.next',
			startCommand: 'node .next/standalone/server.js',
			serverEntry: 'standalone/server.js',
			staticDir: '.next/static',
			buildEnv: {
				// Next.js standalone mode produces a self-contained server
				NEXT_OUTPUT: 'standalone',
			},
			port: 3000,
			confidence: configFile ? 'high' : 'medium',
		};
	},
};
