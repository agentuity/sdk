/**
 * Framework Detection
 *
 * Examines a project directory and determines which JS framework is being used.
 * Returns a DetectedFramework with all the information needed to build and launch.
 *
 * Detection strategy:
 * 1. Check for Agentuity native app (app.ts + @agentuity/runtime) — highest priority
 * 2. Run the framework database engine (rules derived from @vercel/frameworks)
 * 3. Fall back to generic detection (package.json scripts)
 */

import type { DetectedFramework, PackageJsonData } from './types';
import { readPackageJson, detectPackageManager } from './util';
import { frameworkDefinitions } from './frameworks';
import { detectFromDatabase } from './engine';
import { agentuityDetector } from './agentuity';
import { genericDetector } from './generic';

/**
 * Convert a matched framework definition + project context into a DetectedFramework.
 */
async function frameworkDefToDetected(
	slug: string,
	_name: string,
	buildCommand: string | null,
	outputDirectory: string | null,
	projectDir: string,
	pkg: PackageJsonData
): Promise<DetectedFramework> {
	const pm = await detectPackageManager(projectDir);

	// Use the project's build script if available, otherwise the framework default
	const resolvedBuildCommand = pkg.scripts?.build ?? buildCommand ?? 'npm run build';

	// Resolve output directory — use framework default or '.'
	const resolvedOutputDir = outputDirectory ?? '.';

	return {
		name: slug,
		runtime: 'node',
		packageManager: pm,
		mode: 'server', // Default; adapters can override based on actual build output
		buildCommand: resolvedBuildCommand,
		buildOutput: resolvedOutputDir,
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

	// 1. Check Agentuity native first (highest priority)
	const agentuity = await agentuityDetector.detect(projectDir, pkg);
	if (agentuity) return agentuity;

	// 2. Run through the framework database
	const match = await detectFromDatabase(projectDir, pkg, frameworkDefinitions);
	if (match) {
		return frameworkDefToDetected(
			match.slug,
			match.name,
			match.buildCommand,
			match.outputDirectory,
			projectDir,
			pkg
		);
	}

	// 3. Generic fallback
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

	// 1. Check Agentuity native first
	const agentuity = await agentuityDetector.detect(projectDir, pkg);
	if (agentuity) return { framework: agentuity, packageJson: pkg };

	// 2. Run through the framework database
	const match = await detectFromDatabase(projectDir, pkg, frameworkDefinitions);
	if (match) {
		const framework = await frameworkDefToDetected(
			match.slug,
			match.name,
			match.buildCommand,
			match.outputDirectory,
			projectDir,
			pkg
		);
		return { framework, packageJson: pkg };
	}

	// 3. Generic fallback
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
	AppMode,
} from './types';
