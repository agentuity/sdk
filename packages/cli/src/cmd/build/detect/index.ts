/**
 * Framework Detection
 *
 * Examines a project directory and determines which JS framework is being used.
 * Returns a DetectedFramework with all the information needed to build and launch.
 *
 * Detection strategy:
 * 1. Run the framework database engine (rules derived from @vercel/frameworks)
 * 2. Fall back to generic detection (package.json scripts)
 */

import type { DetectedFramework, PackageJsonData } from './types';
import { readPackageJson, detectPackageManager } from './util';
import { frameworkDefinitions } from './frameworks';
import { detectFromDatabase } from './engine';
import { genericDetector } from './generic';

/**
 * Convert a matched framework definition + project context into a DetectedFramework.
 */
async function frameworkDefToDetected(
	slug: string,
	_name: string,
	buildCommand: string | null,
	outputDirectory: string | null,
	staticDirectory: string | null | undefined,
	projectDir: string,
	pkg: PackageJsonData
): Promise<DetectedFramework> {
	const pm = await detectPackageManager(projectDir);

	// Use the project's build script if available, otherwise the framework default
	const resolvedBuildCommand = pkg.scripts?.build ?? buildCommand ?? 'npm run build';

	// Resolve output directory — use framework default or '.'
	const resolvedOutputDir = outputDirectory ?? '.';

	// Resolve static asset directory (relative to project root):
	// - explicit string: path relative to project root (e.g., '.next/static', '.output/public')
	// - null: the entire output directory is static (SSGs, SPAs) — use outputDirectory
	// - undefined: no static assets known for this framework
	const resolvedStaticDir =
		staticDirectory === null
			? resolvedOutputDir // null means entire output IS the static dir
			: (staticDirectory ?? undefined);

	return {
		name: slug,
		runtime: 'node',
		packageManager: pm,
		buildCommand: resolvedBuildCommand,
		buildOutput: resolvedOutputDir,
		staticDir: resolvedStaticDir,
		confidence: 'high',
	};
}

/**
 * Detect the framework used by a project.
 *
 * @param projectDir - Absolute path to the project root
 * @returns DetectedFramework or null if nothing could be detected
 */
export async function detectFramework(projectDir: string): Promise<DetectedFramework | null> {
	const pkg = await readPackageJson(projectDir);
	if (!pkg) return null;

	// 1. Run through the framework database
	const match = await detectFromDatabase(projectDir, pkg, frameworkDefinitions);
	if (match) {
		return frameworkDefToDetected(
			match.slug,
			match.name,
			match.buildCommand,
			match.outputDirectory,
			match.staticDir,
			projectDir,
			pkg
		);
	}

	// 2. Generic fallback
	return genericDetector.detect(projectDir, pkg);
}

/**
 * Detect the framework, but also return the parsed package.json for reuse.
 */
export async function detectFrameworkWithPackageJson(
	projectDir: string
): Promise<{ framework: DetectedFramework | null; packageJson: PackageJsonData | null }> {
	const pkg = await readPackageJson(projectDir);
	if (!pkg) return { framework: null, packageJson: null };

	// 1. Run through the framework database
	const match = await detectFromDatabase(projectDir, pkg, frameworkDefinitions);
	if (match) {
		const framework = await frameworkDefToDetected(
			match.slug,
			match.name,
			match.buildCommand,
			match.outputDirectory,
			match.staticDir,
			projectDir,
			pkg
		);
		return { framework, packageJson: pkg };
	}

	// 2. Generic fallback
	const generic = await genericDetector.detect(projectDir, pkg);
	return { framework: generic, packageJson: pkg };
}

// Re-export types
export type {
	DetectedFramework,
	FrameworkName,
	PackageJsonData,
	PackageManager,
	RuntimeName,
} from './types';
