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
import { pathExists } from '../../../node-compat/fs.ts';
import type { DetectedFramework, FrameworkDetector } from './types.ts';
import { detectPackageManager } from './util.ts';

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

		if (pkg.scripts?.start) {
			startCommand = pkg.scripts.start;
		} else if (pkg.main) {
			// Check if main entry exists
			if (await pathExists(join(projectDir, pkg.main))) {
				const runtime = pm === 'bun' ? 'bun' : 'node';
				startCommand = `${runtime} ${pkg.main}`;
				serverEntry = pkg.main;
			}
		}

		// If no build and no start, we can't do anything
		if (!buildCommand && !startCommand) {
			return null;
		}

		// Pick runtime in this order:
		//   1. The actual `start` script (`bun ...` / `bun run ...` = bun;
		//      `node ...` = node) — strongest signal.
		//   2. `engines.bun` in package.json.
		//   3. A `bun.lock` / `bun.lockb` file in the project root.
		//   4. Default to node.
		const hasBunLockfile =
			(await pathExists(join(projectDir, 'bun.lockb'))) ||
			(await pathExists(join(projectDir, 'bun.lock')));
		const runtime: 'bun' | 'node' = (() => {
			if (startCommand && /^\s*bun(\s+run)?\s+/.test(startCommand)) return 'bun';
			if (startCommand && /^\s*node(\s|$)/.test(startCommand)) return 'node';
			if (pkg.engines?.bun) return 'bun';
			if (hasBunLockfile) return 'bun';
			return 'node';
		})();

		return {
			name: 'generic',
			runtime,
			packageManager: pm,
			buildCommand: buildCommand ?? 'echo "No build step"',
			buildOutput: '.', // Generic — build output could be anywhere
			startCommand,
			serverEntry,
			port: 3000,
			confidence: 'low',
		};
	},
};
