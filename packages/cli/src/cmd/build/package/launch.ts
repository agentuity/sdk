/**
 * Launch metadata generation for buildpack-compatible output.
 *
 * Generates the metadata that tells the runtime how to start the application.
 * This is analogous to CNB's launch.toml / Procfile / Docker CMD.
 */

import { join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import type { BuildResult } from '../adapters/types';
import type { DetectedFramework } from '../detect/types';

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

	return {
		processes,
		framework: {
			name: framework.name,
			version: framework.version,
		},
		runtime: {
			name: framework.runtime,
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
 * Writes both:
 * - launch.json — machine-readable launch metadata
 * - Procfile — simple process definition for compatibility
 */
export function writeLaunchMetadata(outputDir: string, metadata: LaunchMetadata): void {
	mkdirSync(outputDir, { recursive: true });

	// Write JSON metadata
	const jsonPath = join(outputDir, 'launch.json');
	writeFileSync(jsonPath, JSON.stringify(metadata, null, 2), 'utf-8');

	// Write Procfile for broad compatibility (Heroku, Railway, Render, etc.)
	const procfilePath = join(outputDir, 'Procfile');
	const procfileLines = metadata.processes.map((p) => `${p.type}: ${p.command}`);
	writeFileSync(procfilePath, procfileLines.join('\n') + '\n', 'utf-8');
}
