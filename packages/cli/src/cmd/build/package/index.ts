/**
 * Build output packaging.
 *
 * After a framework adapter builds the project, the packager:
 * 1. Generates launch metadata (how to start the app)
 * 2. Writes a Procfile for compatibility
 * 3. Optionally generates additional metadata
 *
 * The output is a self-contained directory ready for deployment
 * as a buildpack image layer or traditional zip upload.
 */

import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import type { DetectedFramework } from '../detect/types';
import type { BuildResult } from '../adapters/types';
import { generateLaunchMetadata, writeLaunchMetadata, type LaunchMetadata } from './launch';

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

/**
 * Package a build result into a deployment-ready directory.
 */
export function packageBuildOutput(
	framework: DetectedFramework,
	buildResult: BuildResult,
	outputDir: string
): PackageResult {
	// Generate launch metadata
	const launch = generateLaunchMetadata(framework, buildResult);

	// Write launch metadata to the output directory
	writeLaunchMetadata(outputDir, launch);

	// Write a .buildpack-ready marker file
	const markerPath = join(outputDir, '.agentuity-build');
	const markerContent = {
		version: 1,
		framework: framework.name,
		runtime: framework.runtime,
		buildDate: new Date().toISOString(),
	};
	writeFileSync(markerPath, JSON.stringify(markerContent, null, 2), 'utf-8');

	return {
		outputDir,
		launch,
		hasStaticAssets: !!buildResult.staticDir,
		staticDir: buildResult.staticDir,
	};
}

// Re-export
export type { LaunchMetadata, ProcessDefinition } from './launch';
