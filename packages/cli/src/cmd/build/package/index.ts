/**
 * Build output packaging.
 *
 * After a framework adapter builds the project, the packager:
 * 1. Rewrites root-public asset URLs onto the CDN base when applicable
 * 2. Generates launch metadata (how to start the app)
 * 3. Writes launch.json
 *
 * The output is a self-contained directory ready for deployment
 * as a buildpack image layer or traditional zip upload.
 *
 * Public CDN policy lives here (not in framework adapters): adapters only
 * stage files and set `BuildResult.publicStaticDir`; packaging owns
 * rewrite + `launch.static.include`.
 */

import type { DetectedFramework } from '../detect/types.ts';
import type { MonorepoContext } from '../detect/monorepo.ts';
import type { BuildResult } from '../adapters/types.ts';
import { resolveAgentuityCdnBase } from '../adapters/cdn-origin.ts';
import {
	generateLaunchMetadata,
	isSplitCdnLayout,
	readUserLaunchOverride,
	resolveProcessRoot,
	writeLaunchMetadata,
	type LaunchMetadata,
} from './launch.ts';
import { rewritePublicAssetUrlsInTree } from './public-cdn.ts';

export interface PackageResult {
	/** Absolute path to the packaged output */
	outputDir: string;

	/** Launch metadata */
	launch: LaunchMetadata;

	/** Whether the output contains static assets */
	hasStaticAssets: boolean;

	/** Path to static assets (if any) */
	staticDir?: string;

	/** Human-readable packaging log lines (e.g. public URL rewrites) */
	logs: string[];
}

export interface PackageBuildOutputOptions {
	/** Explicit CDN base URL from `--cdn-base-url` (written to launch.static.baseUrl). */
	cdnBaseUrl?: string;
}

/**
 * When CDN base is known and packaging staged a split-layout public root,
 * rewrite root-absolute `/file` refs under the process tree to the CDN base.
 */
function rewriteStagedPublicAssets(
	buildResult: BuildResult,
	monorepo: MonorepoContext | undefined,
	cdnBase: string
): string[] {
	const logs: string[] = [];
	if (!buildResult.publicStaticDir) return logs;

	const publicPath = buildResult.staticAssetPublicPath ?? '';
	if (!isSplitCdnLayout(publicPath)) return logs;

	const treeRoot = resolveProcessRoot(buildResult, monorepo);
	const rw = rewritePublicAssetUrlsInTree(treeRoot, buildResult.publicStaticDir, cdnBase);
	if (rw.publicFileCount > 0) {
		logs.push(
			`✓ CDN: rewrote public/ refs in ${rw.filesChanged}/${rw.filesScanned} files ` +
				`(${rw.publicFileCount} public asset(s) → ${cdnBase})`
		);
	}
	return logs;
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
	const logs: string[] = [];

	// Same CDN chain as launch.static.baseUrl / adapters. Rewrite before
	// writing launch.json so staged HTML/JS already point at the CDN.
	const cdnBase = resolveAgentuityCdnBase({ cdnBaseUrl: options?.cdnBaseUrl });
	if (cdnBase) {
		logs.push(...rewriteStagedPublicAssets(buildResult, monorepo, cdnBase));
	}

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
		logs,
	};
}

// Re-export public launch contract types (not rewrite helpers — those stay
// package-internal / testable via their module path).
export type {
	LaunchMetadata,
	LaunchStaticAssets,
	LaunchStaticRoot,
	ProcessDefinition,
} from './launch.ts';
export { joinCdnAssetUrl } from './launch.ts';
