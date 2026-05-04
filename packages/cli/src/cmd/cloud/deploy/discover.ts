/**
 * Discover phase
 * --------------
 *
 * Validates that the current directory looks like something we can deploy
 * and runs framework detection up front.
 *
 * Why up front, before we touch the cloud:
 *   - We can fail fast on "this is not a JS project" with a useful message,
 *     before creating a deployment, registering a project, or asking the
 *     user any questions.
 *   - The detection result feeds the build phase later, so we only run
 *     framework detection once per deploy.
 *   - Showing the user "Detected: Next.js v15 (Node)" early gives instant
 *     feedback that the CLI understood their project.
 *
 * Failure modes are user-actionable: missing package.json, missing build
 * script, etc. We deliberately do NOT call the generic adapter or run
 * `npm run build` here — that's the build phase's job.
 */

import type { Logger } from '@agentuity/core';
import { detectFrameworkWithPackageJson } from '../../build/detect/index.ts';
import {
	type Step,
	type StepOutcome,
	stepError,
	stepSkipped,
	stepSuccess,
} from '../../../steps.ts';
import type { DiscoverResult } from './types.ts';

/**
 * Builds the "Detect Project" step.
 *
 * The step is async-friendly and mutates `state.discover` in place when it
 * succeeds, so subsequent steps in the same `runSteps()` call can read the
 * detection result. Returning it via mutation keeps the `Step` interface
 * (just `label` + `run`) unchanged.
 */
export function buildDiscoverStep(
	projectDir: string,
	logger: Logger,
	state: { discover?: DiscoverResult }
): Step {
	return {
		label: 'Detect Project',
		run: async (): Promise<StepOutcome> => {
			try {
				const { framework, packageJson } = await detectFrameworkWithPackageJson(projectDir);

				if (!packageJson) {
					return stepError(
						'No package.json found. `agentuity deploy` works on any JS/TS project — ensure you are running it from the project root.'
					);
				}

				if (!framework) {
					// detectFrameworkWithPackageJson already falls through to a
					// generic detector; if even that returns null it means the
					// package.json has no usable build script.
					return stepError(
						'Could not determine how to build this project. Add a `build` script to package.json (e.g. "build": "next build") and try again.'
					);
				}

				logger.debug(
					'Discover: framework=%s version=%s runtime=%s buildCommand=%s buildOutput=%s staticDir=%s',
					framework.name,
					framework.version ?? '(unknown)',
					framework.runtime,
					framework.buildCommand,
					framework.buildOutput,
					framework.staticDir ?? '(none)'
				);

				state.discover = { framework, packageJson };

				const versionLabel = framework.version ? ` v${framework.version}` : '';
				const summary = [
					`Framework:    ${framework.name}${versionLabel} (${framework.runtime})`,
					`Build:        ${framework.buildCommand}`,
					`Output:       ${framework.buildOutput}`,
				];
				if (framework.staticDir && framework.staticDir !== framework.buildOutput) {
					summary.push(`Static:       ${framework.staticDir}`);
				}
				summary.push(`Pkg manager:  ${framework.packageManager}`);

				return stepSuccess(summary);
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				return stepError(`Failed to inspect project: ${message}`, err as Error);
			}
		},
	};
}

/**
 * Standalone discover used by paths that don't run inside `runSteps()`
 * (e.g. tests, or future entrypoints that want the result without the
 * step UI). Throws on the same failure modes as the step's `stepError`.
 */
export async function runDiscover(projectDir: string, logger: Logger): Promise<DiscoverResult> {
	const { framework, packageJson } = await detectFrameworkWithPackageJson(projectDir);

	if (!packageJson) {
		throw new Error(
			'No package.json found. `agentuity deploy` works on any JS/TS project — ensure you are running it from the project root.'
		);
	}
	if (!framework) {
		throw new Error(
			'Could not determine how to build this project. Add a `build` script to package.json (e.g. "build": "next build") and try again.'
		);
	}

	logger.debug(
		'Discover: framework=%s version=%s runtime=%s',
		framework.name,
		framework.version ?? '(unknown)',
		framework.runtime
	);

	return { framework, packageJson };
}

// Re-export the helper so consumers can build their own outcomes if needed.
export { stepSkipped };
