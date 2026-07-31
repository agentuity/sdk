/**
 * Build output packaging.
 *
 * After a framework adapter builds the project, the packager:
 * 1. Generates launch metadata (how to start the app)
 * 2. Writes launch.json
 *
 * The output is a self-contained directory ready for deployment
 * as a buildpack image layer or traditional zip upload.
 */

import type { DetectedFramework } from '../detect/types.ts';
import type { MonorepoContext } from '../detect/monorepo.ts';
import type { BuildResult } from '../adapters/types.ts';
import {
	generateLaunchMetadata,
	readUserLaunchOverride,
	writeLaunchMetadata,
	type LaunchMetadata,
} from './launch.ts';

export interface PackageResult {
	/** Absolute path to the packaged output */
	outputDir: string;

	/** Launch metadata */
	launch: LaunchMetadata;

	/** Whether the output contains static assets */
	hasStaticAssets: boolean;

	/** Path to static assets (if any) */
	staticDir?: string;
}

export interface PackageBuildOutputOptions {
	/** Explicit CDN base URL from `--cdn-base-url` (written to launch.static.baseUrl). */
	cdnBaseUrl?: string;
}

/**
 * Package a build result into a deployment-ready directory.
 *
 * If `projectDir` is supplied and contains a user-authored `launch.json`,
 * its fields override the generated launch metadata. See
 * `readUserLaunchOverride` for the merge semantics.
 */
export async function packageBuildOutput(
	framework: DetectedFramework,
	buildResult: BuildResult,
	outputDir: string,
	projectDir?: string,
	monorepo?: MonorepoContext,
	options?: PackageBuildOutputOptions
): Promise<PackageResult> {
	const override = projectDir ? await readUserLaunchOverride(projectDir) : null;

	// Generate launch metadata (with optional user override applied).
	// In monorepo mode, every process inherits the subpackage as its
	// `workingDirectory` so pilot launches inside the right subdir.
	const launch = generateLaunchMetadata(
		framework,
		buildResult,
		override,
		monorepo,
		options?.cdnBaseUrl
	);

	// Write launch metadata to the output directory
	writeLaunchMetadata(outputDir, launch);

	return {
		outputDir,
		launch,
		hasStaticAssets: !!buildResult.staticDir || !!launch.static,
		staticDir: buildResult.staticDir,
	};
}

// Re-export
export type { LaunchMetadata, LaunchStaticAssets, ProcessDefinition } from './launch.ts';
