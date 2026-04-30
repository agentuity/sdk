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

import type { BuildMetadata, DeploymentInstructions } from '@agentuity/server';
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

/**
 * Mutable, shared accumulator passed through the deploy pipeline.
 *
 * Phases write their outputs here so subsequent steps can read them
 * without threading dozens of arguments through the runSteps array.
 * Each phase only writes the fields it owns.
 */
export interface DeployPipelineState {
	/** Set by the Discover step. */
	discover?: DiscoverResult;
	/** Set by the Build step — read by the Upload step. */
	build?: BuildMetadata;
	/** Build output directory (where the zip is sourced from). */
	buildOutputDir?: string;
	/** Upload instructions returned by the server (signed PUT URLs). */
	instructions?: DeploymentInstructions;
}
