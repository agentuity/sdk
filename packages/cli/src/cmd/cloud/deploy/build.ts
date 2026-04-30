/**
 * Build phase
 * -----------
 *
 * Compiles the user's project, generates deploy metadata, and tells the
 * server which assets we'll be uploading.
 *
 * The phase is exposed as a `Step` factory so it slots straight into the
 * deploy command's `runSteps()` pipeline alongside Discover, Sync Env,
 * Security Scan, etc.
 *
 * What happens here, in order:
 *   1. Typecheck the project (via tsc/tsgo, results funneled into the
 *      build report collector).
 *   2. Resolve the framework + package.json. We prefer the cached value
 *      from the Discover phase (set on `state.discover`); we only re-run
 *      detection in child mode where Discover is skipped.
 *   3. Run the framework adapter's `build()` to produce a buildable output
 *      directory (e.g. `.agentuity/`).
 *   4. Package the build output (writes launch.json / Procfile /
 *      .agentuity-build).
 *   5. Generate the deploy metadata blob the server uses to mint upload
 *      URLs. Agentuity-native projects already emit this from their Vite
 *      pipeline; everything else gets metadata derived from the build
 *      result.
 *   6. POST the metadata to `projectDeploymentUpdate` to receive
 *      `DeploymentInstructions` (signed PUT URLs for the code zip and
 *      every static asset).
 *
 * The step writes its results back through `state` so the next steps
 * (Encrypt + Upload, Provision Deployment) can consume them without
 * threading more arguments around.
 */

import { resolve, join } from 'node:path';
import type { Logger } from '@agentuity/core';
import { type BuildMetadata, type Deployment, projectDeploymentUpdate } from '@agentuity/server';
import type { APIClient } from '../../../api.ts';
import type { BuildReportCollector } from '../../../build-report.ts';
import { loadBuildMetadata } from '../../../config.ts';
import { generateDeployMetadata } from '../../../deploy-metadata.ts';
import {
	type Step,
	type StepContext,
	type StepOutcome,
	stepError,
	stepSuccess,
} from '../../../steps.ts';
import * as tui from '../../../tui.ts';
import type { DeployOptions, Project } from '../../../types.ts';
import { getAdapter } from '../../build/adapters/index.ts';
import type { BuildResult } from '../../build/adapters/types.ts';
import { detectFrameworkWithPackageJson } from '../../build/detect/index.ts';
import { packageBuildOutput, type PackageResult } from '../../build/package/index.ts';
import { typecheck } from '../../build/typecheck.ts';
import type { DeployPipelineState } from './types.ts';

export interface BuildStepParams {
	project: Project;
	projectDir: string;
	apiClient: APIClient;
	logger: Logger;
	collector: BuildReportCollector;
	deployment: Deployment | undefined;
	/**
	 * Raw deploy options (provider/branch/commit/etc.). Carries the
	 * subset of CLI flags the build adapter needs to embed in the
	 * generated deploy metadata.
	 */
	deployOptions: DeployOptions;
	/** Whether `--report-file` was passed (forces a report write on error). */
	hasReportFile: boolean;
	/** Pipeline state accumulator (shared with other phases). */
	state: DeployPipelineState;
}

/**
 * Build the "Build, Verify and Package" step.
 *
 * Errors are returned as `stepError` outcomes (the deploy command's
 * `runSteps()` will halt the pipeline). The build report collector is
 * flushed before returning a failure when `--report-file` is set so CI
 * always gets the diagnostics file even if the deploy aborts here.
 */
export function buildBuildStep(params: BuildStepParams): Step {
	const {
		project,
		projectDir,
		apiClient,
		logger,
		collector,
		deployment,
		deployOptions,
		hasReportFile,
		state,
	} = params;

	return {
		label: 'Build, Verify and Package',
		run: async (stepCtx: StepContext): Promise<StepOutcome> => {
			if (!deployment) {
				return stepError('deployment was null');
			}
			const capturedOutput: string[] = [];
			const rootDir = resolve(projectDir);

			// 1. Typecheck. Failures are surfaced via the collector and the
			//    Step's error output; the build report is written before
			//    we return so CI always has the diagnostics on disk.
			const endTypecheckDiagnostic = collector.startDiagnostic('typecheck');
			const started = Date.now();
			const typeResult = await typecheck(rootDir, { collector });
			endTypecheckDiagnostic();

			if (typeResult.success) {
				capturedOutput.push(tui.muted(`✓ Typechecked in ${Date.now() - started}ms`));
			} else {
				if (hasReportFile) {
					await collector.forceWrite();
				}
				return stepError('Typecheck failed\n\n' + typeResult.output);
			}

			try {
				// 2. Resolve framework + package.json. The Discover phase ran
				//    first in normal flow and stashed the result on `state`;
				//    in child mode we skip Discover and re-detect here.
				const discovered =
					state.discover ??
					(await detectFrameworkWithPackageJson(rootDir).then((res) =>
						res.framework && res.packageJson
							? { framework: res.framework, packageJson: res.packageJson }
							: null
					));

				if (!discovered) {
					return stepError(
						'Could not detect a JS framework. Ensure package.json exists with a build script.'
					);
				}

				const { framework, packageJson } = discovered;

				// In child mode we didn't run Discover, so emit a one-line
				// detection summary inline. In normal mode Discover already
				// rendered a richer summary, so we stay quiet here.
				if (!state.discover) {
					const frameworkLabel = framework.version
						? `${framework.name} v${framework.version}`
						: framework.name;
					capturedOutput.push(
						tui.muted(`✓ Detected ${frameworkLabel} (${framework.runtime})`)
					);
				}

				// 3. Adapter build. Output goes to `<rootDir>/.agentuity` by
				//    convention; the adapter may produce a different
				//    `outputDir` if it stages files elsewhere.
				const outDir = join(rootDir, '.agentuity');
				const adapter = getAdapter(framework.name);

				const endBuildDiagnostic = collector.startDiagnostic('build');
				const buildResult: BuildResult = await adapter.build({
					projectDir: rootDir,
					framework,
					packageJson,
					outputDir: outDir,
					logger,
					collector,
					dev: false,
					projectId: project.projectId,
					orgId: deployment.orgId,
					region: project.region,
					deploymentId: deployment.id,
					deploymentOptions: deployOptions,
					deploymentConfig: project.deployment,
				});
				endBuildDiagnostic();

				capturedOutput.push(...buildResult.logs);
				state.buildOutputDir = buildResult.outputDir;

				// 4. Package output: writes launch.json / Procfile /
				//    .agentuity-build into the build output directory.
				const packageResult: PackageResult = packageBuildOutput(
					framework,
					buildResult,
					buildResult.outputDir
				);

				// 5. Generate metadata. Agentuity-native projects emit a
				//    full agentuity.metadata.json from their Vite pipeline
				//    (with routes/agents/assets); everything else has its
				//    metadata generated from the BuildResult.
				const isAgentuity = framework.name === 'agentuity';
				let build: BuildMetadata;

				if (isAgentuity) {
					build = await loadBuildMetadata(buildResult.outputDir);
					build.launch = packageResult.launch;
				} else {
					build = await generateDeployMetadata({
						buildResult,
						packageResult,
						projectDir: rootDir,
						projectId: project.projectId,
						orgId: deployment.orgId,
						region: project.region,
						deploymentId: deployment.id,
						deploymentConfig: project.deployment,
						deploymentOptions: deployOptions,
						logger,
					});
				}

				logger.debug('Launch metadata: %s', JSON.stringify(build.launch, null, 2));
				state.build = build;

				// 6. Send metadata to the server, get back upload URLs.
				state.instructions = await projectDeploymentUpdate(
					apiClient,
					deployment.id,
					build,
					stepCtx.signal
				);

				return stepSuccess(capturedOutput.length > 0 ? capturedOutput : undefined);
			} catch (ex) {
				const _ex = ex as Error;
				if (hasReportFile) {
					await collector.forceWrite();
				}
				return stepError(
					_ex.message ?? 'Error building your project',
					_ex,
					capturedOutput.length > 0 ? capturedOutput : undefined
				);
			}
		},
	};
}
