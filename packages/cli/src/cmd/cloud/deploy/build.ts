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
 *   4. Package the build output (writes launch.json).
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

import { resolve } from 'node:path';
import type { Logger } from '@agentuity/core';
import { type BuildMetadata, type Deployment, projectDeploymentUpdate } from '@agentuity/server';
import type { APIClient } from '../../../api.ts';
import type { BuildReportCollector } from '../../../build-report.ts';
import { getCachedProject } from '../../../cache/index.ts';
import { loadBuildMetadata } from '../../../config.ts';
import { generateDeployMetadata } from '../../../deploy-metadata.ts';
import {
	mergeDeployRolloutMetadata,
	resolveDeployRolloutMetadata,
} from '../../../deploy-rollout-metadata.ts';
import {
	type Step,
	type StepContext,
	type StepOutcome,
	stepError,
	stepSuccess,
} from '../../../steps.ts';
import * as tui from '../../../tui.ts';
import type { DeployOptions, Project } from '../../../types.ts';
import { FrameworkDetectionError, TypecheckError, runBuildPipeline } from '../../build/run.ts';
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
	/**
	 * CLI config — used to look up the cached cloud project (populated by
	 * the Register phase) so the generated build metadata can pin
	 * `project.name` to the cloud's registered name rather than the
	 * possibly-renamed package.json `name`.
	 */
	config?: { name?: string } | null;
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

			// The Register phase pulls the cloud project (for region
			// reconciliation) and caches it. Pin `project.name` in the
			// generated metadata to the cloud's registered name so renaming
			// `package.json` `"name"` doesn't try to rename the cloud project
			// — the server rejects that with a name-collision error when any
			// other project in the org already uses the new name.
			const profile = params.config?.name ?? 'default';
			const registeredProjectName = getCachedProject(profile, project.projectId)?.name;

			try {
				// Run the shared build pipeline: detect framework + monorepo,
				// typecheck, adapter build, packageBuildOutput. The Discover
				// phase may have cached detection on `state.discover`; in child
				// mode Discover is skipped and the pipeline re-runs detection.
				const pipelineResult = await runBuildPipeline({
					projectDir: rootDir,
					logger,
					collector,
					prediscovered: state.discover ?? null,
					projectId: project.projectId,
					orgId: deployment.orgId,
					region: project.region,
					deploymentId: deployment.id,
					deploymentOptions: deployOptions,
					deploymentConfig: project.deployment,
					skipTypeCheck: deployOptions.skipTypeCheck,
				});

				const { framework, buildResult, packageResult } = pipelineResult;

				if (pipelineResult.typecheckMs > 0) {
					capturedOutput.push(tui.muted(`✓ Typechecked in ${pipelineResult.typecheckMs}ms`));
				}

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
					for (const warning of framework.warnings ?? []) {
						capturedOutput.push(`⚠ ${warning}`);
					}
					if (pipelineResult.monorepo) {
						const { packageManager, root, subpath } = pipelineResult.monorepo;
						capturedOutput.push(
							tui.muted(`✓ ${packageManager} workspace ${root} (subpackage: ${subpath})`)
						);
					}
				}

				capturedOutput.push(...buildResult.logs);
				state.buildOutputDir = buildResult.outputDir;

				// 5. Generate metadata. Agentuity-native projects emit a
				//    full agentuity.metadata.json from their Vite pipeline
				//    (with routes/agents/assets); everything else has its
				//    metadata generated from the BuildResult.
				const isAgentuity = framework.name === 'agentuity';
				let build: BuildMetadata;

				if (isAgentuity) {
					build = await loadBuildMetadata(buildResult.outputDir);
					build.launch = packageResult.launch;
					// Same pinning logic as the non-agentuity branch below: prefer
					// the cloud's registered name over whatever package.json (and
					// thus the Vite plugin) wrote into agentuity.metadata.json.
					if (registeredProjectName) {
						build.project.name = registeredProjectName;
					}
					build = mergeDeployRolloutMetadata(
						build,
						resolveDeployRolloutMetadata(deployOptions)
					);
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
						registeredProjectName,
						logger,
					});
				}

				logger.debug('Launch metadata: %s', JSON.stringify(build.launch, null, 2));
				build = mergeDeployRolloutMetadata(build, resolveDeployRolloutMetadata(deployOptions));
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
				// Translate the shared pipeline's structured errors into the
				// Step's failure surface.
				if (ex instanceof FrameworkDetectionError) {
					if (hasReportFile) await collector.forceWrite();
					return stepError(ex.message);
				}
				if (ex instanceof TypecheckError) {
					if (hasReportFile) await collector.forceWrite();
					return stepError('Typecheck failed\n\n' + ex.output);
				}
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
