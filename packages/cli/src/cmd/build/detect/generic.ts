/**
 * Generic JS/TS project detector (fallback).
 *
 * This is the catch-all detector for projects that don't match any specific
 * framework. It looks for:
 * 1. A package.json with a "build" script
 * 2. A "start" script or "main" field for the start command
 *
 * If neither is found, detection fails — we can't build what we don't understand.
 */

import { join } from 'node:path';
import type { FrameworkDetector, DetectedFramework } from './types';
import { detectPackageManager } from './util';

export const genericDetector: FrameworkDetector = {
	name: 'generic',
	priority: 100, // Lowest priority — true fallback

	async detect(projectDir, pkg): Promise<DetectedFramework | null> {
		// Must have a package.json with something we can work with
		if (!pkg.scripts?.build && !pkg.scripts?.start && !pkg.main) {
			return null;
		}

		const pm = await detectPackageManager(projectDir);

		// Determine build command
		const buildCommand = pkg.scripts?.build ?? null;
		if (!buildCommand) {
			// No build script — might be a runtime-only project
			// We'll still try if there's a start command
		}

		// Determine start command
		let startCommand: string | undefined;
		let serverEntry: string | undefined;
		let mode: 'server' | 'static' = 'server';

		if (pkg.scripts?.start) {
			startCommand = pkg.scripts.start;
		} else if (pkg.main) {
			// Check if main entry exists
			const mainFile = Bun.file(join(projectDir, pkg.main));
			if (await mainFile.exists()) {
				const runtime = pm === 'bun' ? 'bun' : 'node';
				startCommand = `${runtime} ${pkg.main}`;
				serverEntry = pkg.main;
			}
		}

		// If no build and no start, we can't do anything
		if (!buildCommand && !startCommand) {
			return null;
		}

		// Detect if it's a static site by checking common output dirs
		// If there's no start command but there is a build, assume static
		if (!startCommand && buildCommand) {
			mode = 'static';
		}

		// Detect runtime from engines field or package manager
		const runtime = pkg.engines?.bun ? 'bun' : pm === 'bun' ? 'bun' : 'node';

		return {
			name: 'generic',
			runtime,
			packageManager: pm,
			mode,
			buildCommand: buildCommand ?? 'echo "No build step"',
			buildOutput: '.', // Generic — build output could be anywhere
			startCommand,
			serverEntry,
			port: 3000,
			confidence: 'low',
		};
	},
};
