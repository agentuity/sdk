/**
 * Launch metadata generation for buildpack-compatible output.
 *
 * Generates the metadata that tells the runtime how to start the application.
 * This is analogous to CNB's launch.toml / Docker CMD.
 */

import { join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import type { BuildResult } from '../adapters/types.ts';
import type { DetectedFramework } from '../detect/types.ts';

/**
 * Process definition for the launch metadata.
 */
export interface ProcessDefinition {
	/** Process type (e.g., 'web', 'worker') */
	type: string;
	/** Command to execute */
	command: string;
	/** Whether this is the default process */
	default: boolean;
	/** Working directory (relative to app root) */
	workingDirectory?: string;
}

/**
 * Complete launch metadata written to the output directory.
 */
export interface LaunchMetadata {
	/** Application processes */
	processes: ProcessDefinition[];
	/** Framework that was detected */
	framework: {
		name: string;
		version?: string;
	};
	/** Runtime information */
	runtime: {
		name: string;
		port?: number;
	};
	/** Build information */
	build: {
		date: string;
		duration: number;
	};
}

/**
 * Generate launch metadata from a build result and detected framework.
 */
export function generateLaunchMetadata(
	framework: DetectedFramework,
	buildResult: BuildResult
): LaunchMetadata {
	const processes: ProcessDefinition[] = [];

	// Primary web process
	const startCommand = buildResult.startCommand ?? framework.startCommand;
	if (startCommand) {
		processes.push({
			type: 'web',
			command: startCommand,
			default: true,
		});
	}

	// Reconcile runtime against the actual launch command.
	// `framework.runtime` reflects what the detector inferred from the
	// project (lockfile, engines, the start script before adapters had
	// a chance to rewrite it). But adapters can override the start
	// command — e.g. the Next.js adapter writes `node server.js`
	// because Next.js standalone is Node-only, even if the user's
	// project uses Bun for everything else. The runtime in launch.json
	// must match what gets executed; pilot's memory tuning depends on
	// it.
	const runtimeName = (() => {
		if (startCommand && /^\s*bun(\s+run)?\s+/.test(startCommand)) return 'bun';
		if (startCommand && /^\s*node(\s|$)/.test(startCommand)) return 'node';
		return framework.runtime;
	})();

	return {
		processes,
		framework: {
			name: framework.name,
			version: framework.version,
		},
		runtime: {
			name: runtimeName,
			port: buildResult.port ?? framework.port,
		},
		build: {
			date: new Date().toISOString(),
			duration: buildResult.duration,
		},
	};
}

/**
 * Write launch metadata to the output directory.
 *
 * Writes launch.json — machine-readable launch metadata.
 */
export function writeLaunchMetadata(outputDir: string, metadata: LaunchMetadata): void {
	mkdirSync(outputDir, { recursive: true });

	const jsonPath = join(outputDir, 'launch.json');
	writeFileSync(jsonPath, JSON.stringify(metadata, null, 2), 'utf-8');
}
