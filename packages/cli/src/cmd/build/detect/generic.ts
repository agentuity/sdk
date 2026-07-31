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
import {
	detectPackageManager,
	isAgentuityCliInvocation,
	resolveRuntimeFromStartCommand,
} from './util.ts';

export const genericDetector: FrameworkDetector = {
	name: 'generic',
	priority: 100, // Lowest priority — true fallback

	async detect(projectDir, pkg): Promise<DetectedFramework | null> {
		// Ignore scripts that just re-invoke the agentuity CLI — honoring
		// them would recurse. v2 → v3 migrations that didn't rewrite
		// `package.json` scripts hit this all the time.
		const userBuild = isAgentuityCliInvocation(pkg.scripts?.build)
			? undefined
			: pkg.scripts?.build;
		const userStart = isAgentuityCliInvocation(pkg.scripts?.start)
			? undefined
			: pkg.scripts?.start;

		// Must have a package.json with something we can work with
		if (!userBuild && !userStart && !pkg.main) {
			return null;
		}

		const pm = await detectPackageManager(projectDir);

		// For the fallback detector, run the package.json script by name
		// instead of re-interpreting its contents. A script like
		// `"build": "tsc"` must execute as `npm run build`, not
		// `npm run tsc`.
		const buildCommand = userBuild ? 'build' : null;
		if (!buildCommand) {
			// No build script — might be a runtime-only project
			// We'll still try if there's a start command
		}

		// Determine start command
		let startCommand: string | undefined;
		let serverEntry: string | undefined;

		if (userStart) {
			startCommand = userStart;
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
		//      `node ...` = node; env prefixes like HOST= are stripped).
		//   2. `engines.bun` in package.json.
		//   3. A `bun.lock` / `bun.lockb` file in the project root.
		//   4. Default to node.
		const hasBunLockfile =
			(await pathExists(join(projectDir, 'bun.lockb'))) ||
			(await pathExists(join(projectDir, 'bun.lock')));
		const runtime: 'bun' | 'node' = resolveRuntimeFromStartCommand(
			startCommand,
			pkg.engines?.bun || hasBunLockfile ? 'bun' : 'node'
		);

		return {
			name: 'generic',
			runtime,
			packageManager: pm,
			buildCommand: buildCommand ?? 'echo "No build step"',
			buildCommandKind: buildCommand ? 'package-script' : 'none',
			buildOutput: '.', // Generic — build output could be anywhere
			startCommand,
			serverEntry,
			port: 3000,
			confidence: 'low',
		};
	},
};
