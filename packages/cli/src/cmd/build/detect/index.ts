/**
 * Framework Detection
 *
 * Examines a project directory and determines which JS framework is being used.
 * Returns a DetectedFramework with all the information needed to build and launch.
 *
 * Detection order is priority-based: specific frameworks are checked before generic.
 * The first detector that returns a non-null result wins.
 */

import type { DetectedFramework, FrameworkDetector, PackageJsonData } from './types';
import { readPackageJson } from './util';

// Import detectors
import { agentuityDetector } from './agentuity';
import { nextjsDetector } from './nextjs';
import { nuxtDetector } from './nuxt';
import { remixDetector } from './remix';
import { sveltekitDetector } from './sveltekit';
import { astroDetector } from './astro';
import { viteDetector } from './vite';
import { genericDetector } from './generic';

/**
 * All registered framework detectors, sorted by priority.
 */
const detectors: FrameworkDetector[] = [
	agentuityDetector,
	nextjsDetector,
	nuxtDetector,
	remixDetector,
	sveltekitDetector,
	astroDetector,
	viteDetector,
	genericDetector,
].sort((a, b) => a.priority - b.priority);

/**
 * Detect the framework used by a project.
 *
 * @param projectDir - Absolute path to the project root
 * @returns DetectedFramework or null if nothing could be detected
 */
export async function detectFramework(projectDir: string): Promise<DetectedFramework | null> {
	const pkg = await readPackageJson(projectDir);
	if (!pkg) return null;

	for (const detector of detectors) {
		const result = await detector.detect(projectDir, pkg);
		if (result) return result;
	}

	return null;
}

/**
 * Detect the framework, but also return the parsed package.json for reuse.
 */
export async function detectFrameworkWithPackageJson(
	projectDir: string
): Promise<{ framework: DetectedFramework | null; packageJson: PackageJsonData | null }> {
	const pkg = await readPackageJson(projectDir);
	if (!pkg) return { framework: null, packageJson: null };

	for (const detector of detectors) {
		const result = await detector.detect(projectDir, pkg);
		if (result) return { framework: result, packageJson: pkg };
	}

	return { framework: null, packageJson: pkg };
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
