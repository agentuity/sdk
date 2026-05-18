/**
 * Launch metadata generation for buildpack-compatible output.
 *
 * Generates the metadata that tells the runtime how to start the application.
 * This is analogous to CNB's launch.toml / Docker CMD.
 */

import { join } from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { BuildResult } from '../adapters/types.ts';
import type { DetectedFramework } from '../detect/types.ts';

/**
 * Filename the CLI looks for at the project root when a user wants to
 * override or fully supply the launch metadata. Same name as the file
 * we emit into the build output so users can copy/edit one we generated.
 */
export const USER_LAUNCH_FILENAME = 'launch.json';

/**
 * Partial launch metadata a user can ship at the project root to
 * override what the CLI infers. Every field is optional; provided
 * fields win over the generated ones. `build.{date,duration}` is
 * always machine-generated and ignored here.
 */
export interface UserLaunchOverride {
	processes?: ProcessDefinition[];
	framework?: { name?: string; version?: string };
	runtime?: { name?: string; port?: number };
}

/**
 * Read a user-supplied `launch.json` from the project root, if any.
 *
 * Returns `null` when the file is missing. Throws on invalid JSON —
 * a malformed override is a user error worth surfacing rather than
 * silently falling back to inference.
 */
export function readUserLaunchOverride(projectDir: string): UserLaunchOverride | null {
	const path = join(projectDir, USER_LAUNCH_FILENAME);
	if (!existsSync(path)) return null;
	try {
		return JSON.parse(readFileSync(path, 'utf-8')) as UserLaunchOverride;
	} catch (ex) {
		const _ex = ex as Error;
		throw new Error(`Invalid ${USER_LAUNCH_FILENAME} at ${path}: ${_ex.message}`);
	}
}

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
 *
 * If a user-supplied override is provided, its fields take precedence:
 * `processes` (whole array replaces ours), `framework.{name,version}`,
 * and `runtime.{name,port}`. `build.{date,duration}` is always emitted
 * from the actual build and cannot be overridden.
 */
export function generateLaunchMetadata(
	framework: DetectedFramework,
	buildResult: BuildResult,
	override?: UserLaunchOverride | null
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

	const finalProcesses =
		override?.processes && override.processes.length > 0 ? override.processes : processes;

	return {
		processes: finalProcesses,
		framework: {
			name: override?.framework?.name ?? framework.name,
			version: override?.framework?.version ?? framework.version,
		},
		runtime: {
			name: override?.runtime?.name ?? runtimeName,
			port: override?.runtime?.port ?? buildResult.port ?? framework.port,
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
