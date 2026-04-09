/**
 * Agentuity native framework detector.
 *
 * Detects native Agentuity projects by:
 * 1. Presence of app.ts in project root
 * 2. '@agentuity/runtime' in dependencies
 *
 * These are projects built specifically for the Agentuity platform
 * using createApp() and the agent/route system.
 */

import { join } from 'node:path';
import type { FrameworkDetector, DetectedFramework } from './types';
import { hasDependency, getDependencyVersion, detectPackageManager } from './util';

export const agentuityDetector: FrameworkDetector = {
	name: 'agentuity',
	priority: 5, // Highest priority — check first

	async detect(projectDir, pkg): Promise<DetectedFramework | null> {
		const hasAppTs = await Bun.file(join(projectDir, 'app.ts')).exists();
		const hasRuntime = hasDependency(pkg, '@agentuity/runtime');

		// Must have both app.ts AND the runtime dependency
		if (!hasAppTs || !hasRuntime) return null;

		const pm = await detectPackageManager(projectDir);
		const version =
			getDependencyVersion(pkg, '@agentuity/runtime')?.replace(/[\^~>=<]*/g, '') ?? undefined;

		return {
			name: 'agentuity',
			version,
			runtime: 'bun',
			packageManager: pm,
			// For Agentuity native, the build is handled by the agentuity adapter
			// which uses the existing viteBundle pipeline
			buildCommand: '__agentuity_internal__',
			buildOutput: '.agentuity',
			startCommand: 'bun .agentuity/app.js',
			serverEntry: 'app.js',
			port: 3500,
			confidence: 'high',
		};
	},
};
