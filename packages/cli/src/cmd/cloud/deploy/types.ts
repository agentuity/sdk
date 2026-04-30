/**
 * Shared types for the deploy command pipeline.
 *
 * The deploy command runs as a phased pipeline:
 *   discover  -> register -> preflight -> build -> upload -> wait
 *
 * Each phase produces a small, well-typed output that the next phase
 * consumes. Putting the shared shapes here keeps each phase module
 * focused on its own responsibility.
 */

import type { DetectedFramework, PackageJsonData } from '../../build/detect/types';

/**
 * Output of the discover phase.
 *
 * The phase validates that the directory looks like a JS/TS project we can
 * build, runs framework detection once, and hands the result down the
 * pipeline so later phases (notably build) don't have to re-detect.
 */
export interface DiscoverResult {
	/** The detected framework (with runtime, build command, output dir, etc.). */
	framework: DetectedFramework;
	/** The parsed package.json that produced the detection. */
	packageJson: PackageJsonData;
}
