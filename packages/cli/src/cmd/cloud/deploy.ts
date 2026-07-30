import { writeFileSync } from 'node:fs';
import { StructuredError } from '@agentuity/core';
import {
	type Deployment,
	type DeploymentComplete,
	getAppBaseURL,
	type MalwareCheckResult,
	projectDeploymentMalwareCheck,
	projectEnvUpdate,
} from '@agentuity/server';
import { z } from 'zod';
import {
	BuildReportCollector,
	clearGlobalCollector,
	setGlobalCollector,
} from '../../build-report.ts';
import { getCommand } from '../../command-prefix.ts';
import {
	getGlobalCatalystAPIClient,
	loadProjectSDKKey,
	saveProjectDir,
	updateProjectConfig,
} from '../../config.ts';
import * as domain from '../../domain.ts';
import { filterAgentuitySdkKeys, loadProjectEnvVars, splitEnvAndSecrets } from '../../env-util.ts';
import { ErrorCode, getExitCode } from '../../errors.ts';
import {
	pauseStepUI,
	runSteps,
	type Step,
	StepInterruptError,
	stepError,
	stepSkipped,
	stepSuccess,
} from '../../steps.ts';
import * as tui from '../../tui.ts';
import { createSubcommand, DeployOptionsSchema } from '../../types.ts';
import type { GlobalOptions, Logger } from '../../types.ts';
import { isJSONMode, outputJSON } from '../../output.ts';
import { extractDependencies } from '../../utils/deps.ts';
import { detectAgentuityLegacy } from '../build/detect/agentuity-legacy.ts';
import { readPackageJson } from '../build/detect/util.ts';
import { findLocalCli } from '../../local-delegate.ts';
import { spawnInherit } from '../../node-compat/proc.ts';
import { buildBuildStep } from './deploy/build.ts';
import { buildDiscoverStep } from './deploy/discover.ts';
import { PreflightAptValidationError, runPreflight } from './deploy/preflight.ts';
import { runRegister } from './deploy/register.ts';
import type { DeployPipelineState } from './deploy/types.ts';
import { runPackOnly } from './deploy/pack.ts';
import { buildEncryptUploadStep, buildProvisionStep } from './deploy/upload.ts';
import { runWaitForDeployment } from './deploy/wait.ts';
import { parseDurationMs, waitForDeployment } from './deployment/wait-core.ts';
import { getProjectGithubStatus } from '../git/api.ts';
import { runGitLink } from '../git/link.ts';
import { runForkedDeploy } from './deploy-fork.ts';

const DeploymentCancelledError = StructuredError(
	'DeploymentCancelled',
	'Deployment cancelled by user'
);

/**
 * Loop guard so a handed-off legacy deploy doesn't try to hand off again (the
 * project-local CLI might itself be a v3 in some odd setup).
 */
const LEGACY_DEPLOY_HANDOFF_ENV = 'AGENTUITY_LEGACY_DEPLOY_HANDOFF';

/**
 * When this (v3) CLI is asked to deploy a legacy (v1/v2) Agentuity project,
 * hand the whole deploy to the project-local legacy CLI's `deploy` and return
 * its exit outcome. Legacy apps can't go through the v3 buildpack pipeline
 * because the legacy build bakes route/agent ids keyed to the deployment id —
 * only the legacy `deploy` flow knows that id at build time.
 *
 * Returns a `DeployResponse`-shaped value when it handed off (the caller
 * returns it and the process exits), or null to let the normal v3 pipeline
 * run (not a legacy project).
 *
 * If the project IS legacy but no local legacy CLI is available to hand off
 * to, we fatal with a clear, actionable message instead of letting the v3
 * pipeline ship a broken deploy.
 */
async function maybeHandoffLegacyDeploy(
	projectDir: string,
	logger: Logger,
	options: GlobalOptions
): Promise<{ success: boolean; deploymentId: string; projectId: string } | null> {
	if (process.env[LEGACY_DEPLOY_HANDOFF_ENV]) return null;

	const pkg = await readPackageJson(projectDir);
	if (!pkg) return null;

	const legacy = await detectAgentuityLegacy(projectDir, pkg);
	if (!legacy) return null; // not a legacy app — run the v3 pipeline as usual

	// Match the install hint to the detected major (v1 → ^1, v2 → ^2).
	const major = legacy.version?.split('.')[0] ?? '2';
	const json = isJSONMode(options);

	// Fatal helper that emits a structured error in --json mode and a
	// human-readable fatal otherwise. Declared as a function so its `never`
	// return type narrows `local` after the guards below.
	function fatal(message: string): never {
		if (json) {
			outputJSON({ success: false, errorCode: ErrorCode.CONFIG_INVALID, message });
			const exit = (globalThis as { AGENTUITY_PROCESS_EXIT?: (c: number) => never })
				.AGENTUITY_PROCESS_EXIT;
			if (exit) exit(1);
			process.exit(1);
		}
		tui.fatal(message, ErrorCode.CONFIG_INVALID);
		// tui.fatal exits the process; this throw is unreachable but makes the
		// `never` return type provable to the type checker.
		throw new Error(message);
	}

	const local = findLocalCli(projectDir);
	if (!local) {
		fatal(
			`This is an Agentuity v${major} project (@agentuity/runtime ` +
				`${legacy.version}) which must be deployed with the v${major} CLI. ` +
				`Install it locally with \`bun add -D @agentuity/cli@^${major}\` and re-run ` +
				'`agentuity deploy`, or migrate to v3 with `npx @agentuity/migrate@next`.'
		);
	}

	// `findLocalCli` returns ANY local @agentuity/cli regardless of major. If it
	// doesn't match the project's legacy major, handing off would run the wrong
	// CLI (and the "deploying with v${major}" message would be a lie), so fail
	// fast with an actionable hint instead.
	const localMajor = local.version.split('.')[0];
	if (localMajor !== major) {
		fatal(
			`This is an Agentuity v${major} project, but the locally-installed ` +
				`@agentuity/cli is v${local.version}. Install \`@agentuity/cli@^${major}\` ` +
				'locally and re-run `agentuity deploy`.'
		);
	}

	const handoffMsg = `Detected a v${major} project — deploying with the local v${major} CLI (${local.version}).`;
	if (json) {
		outputJSON({ status: 'legacy-handoff', major, localVersion: local.version });
	} else {
		tui.info(handoffMsg);
	}
	logger.debug('legacy deploy handoff: %s %s', local.binPath, process.argv.slice(2).join(' '));

	const argv = process.argv.slice(2);
	const { exitCode } = await spawnInherit({
		cmd: [local.binPath, ...argv],
		cwd: projectDir,
		env: { [LEGACY_DEPLOY_HANDOFF_ENV]: '1' },
	});

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const exit = (globalThis as any).AGENTUITY_PROCESS_EXIT || process.exit;
	exit(exitCode ?? 0);
	// Unreachable, but satisfies the return type for callers that don't exit.
	return { success: exitCode === 0, deploymentId: '', projectId: pkg.name ?? '' };
}

const DeployResponseSchema = z.object({
	success: z.boolean().describe('Whether deployment succeeded'),
	/** Omitted for offline modes (`--pack-only` / `--upload-url`; no cloud deployment). */
	deploymentId: z.string().optional().describe('Deployment ID'),
	projectId: z.string().describe('Project ID'),
	rolloutId: z
		.string()
		.optional()
		.describe('Genesis managed rollout id when fan-out was triggered'),
	/** Present when a local deployment zip was retained (offline / pack-only). */
	packPath: z.string().optional().describe('Absolute path to the offline deployment zip'),
	fileCount: z.number().optional().describe('Number of files in the offline deployment zip'),
	sizeBytes: z.number().optional().describe('Offline deployment zip size in bytes'),
	/** Staging paths not packed at the zip step (filter / symlink / directory). */
	skippedCount: z
		.number()
		.optional()
		.describe('Paths skipped when building the offline deployment zip'),
	/** True when monorepo staging applied user `.agentuityignore` patterns. */
	usedIgnorePatterns: z
		.boolean()
		.optional()
		.describe('Whether .agentuityignore patterns were applied during monorepo staging'),
	/** True when the zip was uploaded via `--upload-url`. */
	uploaded: z.boolean().optional().describe('Whether the zip was uploaded to --upload-url'),
	logs: z.array(z.string()).optional().describe('The deployment startup logs'),
	urls: z
		.object({
			deployment: z.string().describe('Deployment-specific URL'),
			latest: z.string().describe('Latest/active deployment URL'),
			custom: z.array(z.string()).optional().describe('Custom domain URLs'),
			dashboard: z.string().describe('The dashboard URL for the deployment'),
		})
		.optional()
		.describe('Deployment URLs'),
});

export const deploySubcommand = createSubcommand({
	name: 'deploy',
	description: 'Deploy project to the Agentuity Cloud',
	tags: ['mutating', 'creates-resource', 'slow', 'api-intensive', 'requires-auth'],
	examples: [
		{ command: getCommand('cloud deploy'), description: 'Deploy current project' },
		{
			command: getCommand('cloud deploy --log-level=debug'),
			description: 'Deploy with verbose output',
		},
		{
			command: getCommand('cloud deploy --wait --json'),
			description: 'Deploy and return structured wait status',
		},
		{
			command: getCommand('cloud deploy --no-wait --json'),
			description: 'Upload a deployment without waiting for readiness',
		},
		{
			command: getCommand('cloud deploy --name "My Project"'),
			description: 'Deploy and use a display name if the project must be registered',
		},
		{
			command: getCommand('cloud deploy --project-config agentuity.staging.json'),
			description: 'Deploy using an alternate project config (different project id/domains)',
		},
		{
			command: getCommand(
				'cloud deploy --project-config agentuity.staging.json --env .env --env .env.staging'
			),
			description: 'Deploy with staging project config and layered env files',
		},
		{
			command: getCommand('cloud deploy --pack-only --log-level=trace'),
			description:
				'Offline: build and package the deploy zip (no login, agentuity.json, or cloud upload)',
		},
		{
			command: getCommand('cloud deploy --pack-only --pack-output ./out/deploy.zip'),
			description: 'Offline: write the deployment zip to a custom path',
		},
		{
			command: getCommand(
				'cloud deploy --upload-url "https://bucket.s3.amazonaws.com/key?X-Amz-Signature=..."'
			),
			description:
				'Offline: build, package, and PUT the zip to a presigned S3 URL (your own bucket)',
		},
		{
			command: getCommand(
				'cloud deploy --upload-url "https://example.com/upload" --pack-output ./out/deploy.zip'
			),
			description: 'Offline: upload to a custom URL and keep a local copy of the zip',
		},
	],
	toplevel: true,
	idempotent: false,
	// `project` is optional at the CLI gate level: in a vanilla JS/TS dir we
	// want `agentuity deploy` to work end-to-end (discover -> register ->
	// deploy) without first running `agentuity project import`. The handler
	// below guarantees a registered project before any deploy work happens
	// via the Register phase (`reconcileProject`).
	// Offline modes (`--pack-only` / `--upload-url`) skip auth in cli.ts
	// before this gate runs; cloud deploy still requires auth + API client.
	requires: { auth: true, apiClient: true },
	optional: { project: true },
	prerequisites: ['auth login'],
	resourceRules: [
		{
			resource: 'project',
			required: false,
			flag: 'project-id',
			envVar: 'AGENTUITY_CLOUD_PROJECT_ID',
			impliedFrom: 'agentuity.json',
		},
		{
			resource: 'region',
			required: true,
			flag: 'region',
			envVar: 'AGENTUITY_REGION',
			configPref: 'region',
			operationType: 'mutate',
		},
	],
	schema: {
		options: z.intersection(
			DeployOptionsSchema,
			z.object({
				name: z
					.string()
					.optional()
					.describe(
						'project name to use when deploy auto-registers an unregistered directory'
					),
				reportFile: z
					.string()
					.optional()
					.describe(
						'file path to save build report JSON with errors, warnings, and diagnostics'
					),
				childMode: z
					.boolean()
					.optional()
					.default(false)
					.describe('Internal: run as forked child process'),
				confirm: z
					.boolean()
					.optional()
					.default(false)
					.describe('Confirm region change without prompting (for non-TTY environments)'),
			})
		),
		response: DeployResponseSchema,
	},

	async handler(ctx) {
		const {
			apiClient,
			projectDir,
			config,
			options,
			logger,
			opts,
			auth,
			orgId,
			region,
			projectConfigPath,
		} = ctx;
		const projectConfigOpts = projectConfigPath ? { configPath: projectConfigPath } : undefined;

		// Offline deploy (`--pack-only` and/or `--upload-url`):
		// build + zip (+ optional PUT to a caller-provided URL) without login,
		// project registration, agentuity.json validation, DNS, or cloud APIs.
		// The CLI gate also skips auth/project load when these flags are set.
		const isOfflineDeploy = Boolean(opts.packOnly) || Boolean(opts.uploadUrl);
		if (isOfflineDeploy) {
			const collector = new BuildReportCollector();
			if (opts.reportFile) {
				collector.setOutputPath(opts.reportFile);
				collector.enableAutoWrite();
				setGlobalCollector(collector);
			}

			const packResult = await runPackOnly({
				project: ctx.project,
				projectDir,
				logger,
				collector,
				deployOptions: opts,
				hasReportFile: Boolean(opts.reportFile),
				packOutput: opts.packOutput,
				uploadUrl: opts.uploadUrl,
				json: isJSONMode(options),
			});
			return {
				success: true,
				projectId: packResult.projectId,
				packPath: packResult.packPath,
				fileCount: packResult.fileCount,
				sizeBytes: packResult.sizeBytes,
				skippedCount: packResult.skippedCount,
				usedIgnorePatterns: packResult.usedIgnorePatterns,
				uploaded: packResult.uploaded,
				logs: packResult.logs,
			};
		}

		// Legacy handoff: a legacy (v1/v2) Agentuity app cannot be deployed by
		// the v3 buildpack pipeline (its `agentuity build` bakes route/agent ids
		// keyed to the deployment id, which only the legacy `deploy` flow knows).
		// When this v3 CLI is asked to deploy a legacy project, hand the whole
		// deploy to the project-local legacy CLI's `deploy` and exit with its
		// code. Skipped when we're a forked child (the parent already handed off
		// or this isn't legacy) or already running as the handed-off legacy deploy.
		const isForkedChild = opts.childMode || process.env.AGENTUITY_FORK_PARENT === '1';
		if (!isForkedChild) {
			// Pin any "latest"-pinned Agentuity deps to the version actually
			// installed (from the lockfile) before anything else — including the
			// legacy handoff below, so legacy apps get pinned too. Keeps the deploy
			// reproducible and stops a "latest"-pinned legacy project from silently
			// pulling v3 once v3 becomes the `latest` dist-tag.
			try {
				const { pinLatestAgentuityDeps } = await import('../../pin-latest.ts');
				const pinned = await pinLatestAgentuityDeps(projectDir, logger);
				// Human-readable summary only outside --json mode (keeps machine
				// output clean). The pin still happens either way.
				if (pinned.length > 0 && !isJSONMode(options)) {
					tui.info(
						`Pinned ${pinned.length} Agentuity ${pinned.length === 1 ? 'dependency' : 'dependencies'} from "latest" to installed version:`
					);
					for (const { name, version } of pinned) {
						tui.info(tui.muted(`  ${name} → ${version}`));
					}
				}
			} catch (err) {
				logger.debug('pin-latest: skipped due to error: %s', err);
			}

			const handed = await maybeHandoffLegacyDeploy(projectDir, logger, options);
			if (handed) return handed as never;
		}

		// Mutable, shared accumulator threaded through the deploy steps.
		// Each phase writes its own outputs onto this object so later steps
		// can read them without ballooning the step factory signatures.
		const pipelineState: DeployPipelineState = {};

		// Resolve a registered project for this directory. Under `optional.project`
		// the cli.ts gate may hand us `ctx.project=undefined` (no agentuity.json);
		// the Register phase guarantees a real project is in hand before any
		// deploy work happens, registering/importing one if necessary.
		const { isTTY } = await import('../../auth.ts');
		const hasTTY = process.stdin.isTTY && process.stdout.isTTY;

		const registerResult = await runRegister({
			project: ctx.project,
			projectDir,
			apiClient,
			auth,
			config: config!,
			logger,
			confirm: opts.confirm,
			interactive: isTTY(),
			orgId,
			region,
			name: opts.name,
			projectConfigPath,
		});
		const project = registerResult.project;

		// Initialize build report collector if reportFile is specified
		const collector = new BuildReportCollector();
		if (opts.reportFile) {
			collector.setOutputPath(opts.reportFile);
			collector.enableAutoWrite();
			setGlobalCollector(collector);
		}

		// Mutable state that survives between phases. The build/upload
		// products (`build`, `buildOutputDir`, `instructions`) live on
		// `pipelineState` and are written by the Build step; downstream
		// readers (Encrypt + Upload, Provision Deployment) consume them
		// from there directly.
		let deployment: Deployment | undefined;
		// `complete` is produced by the Provision step but read by the wait
		// phase that follows `runSteps()`. We thread it through a ref-cell
		// so the step can mutate it without us creating a separate result
		// channel just for one value.
		const completeRef: { current?: DeploymentComplete } = {};
		let malwareCheckPromise: Promise<MalwareCheckResult | null> | undefined;
		const logs: string[] = [];

		const sdkKey = await loadProjectSDKKey(ctx.logger, ctx.projectDir);

		// Ensure SDK key is present before proceeding
		if (!sdkKey) {
			ctx.logger.fatal(
				'The AGENTUITY_SDK_KEY value not found in the .env file in this folder. Ensure you are inside a valid Agentuity project folder and run "%s" to pull your environment from the cloud.',
				getCommand('cloud env pull')
			);
		}

		// Check if we're running as a forked child process
		const isChildProcess = opts.childMode || process.env.AGENTUITY_FORK_PARENT === '1';
		const deploymentEnv = process.env.AGENTUITY_DEPLOYMENT;

		// If not in child mode and no pre-created deployment, run as fork wrapper to capture crashes
		// (CI builds set AGENTUITY_DEPLOYMENT, fork wrapper also sets it for the child)
		if (!isChildProcess && !deploymentEnv) {
			logger.debug('Running deploy as fork wrapper');

			// Preflight: validate the deploy section of agentuity.json (resource
			// limits + apt dependencies) and create the deployment record on the
			// server. Returns the Deployment with id/publicKey/stream URLs that
			// the forked child needs to encrypt + upload + tail logs.
			let initialDeployment: Deployment;
			try {
				const preflight = await runPreflight({
					project,
					apiClient,
					config,
					logger,
					json: options.json === true,
				});
				initialDeployment = preflight.deployment;
			} catch (err) {
				if (err instanceof PreflightAptValidationError) {
					// JSON mode: surface the structured error envelope through the
					// command's normal return path so callers can render it.
					return err.payload as never;
				}
				throw err;
			}

			// Build args to pass to child, excluding child-mode specific ones
			const childArgs: string[] = [];
			if (opts.logsUrl) childArgs.push(`--logs-url=${opts.logsUrl}`);
			if (opts.trigger) childArgs.push(`--trigger=${opts.trigger}`);
			if (opts.commitUrl) childArgs.push(`--commit-url=${opts.commitUrl}`);
			if (opts.message) childArgs.push(`--message=${opts.message}`);
			if (opts.commit) childArgs.push(`--commit=${opts.commit}`);
			if (opts.branch) childArgs.push(`--branch=${opts.branch}`);
			if (opts.provider) childArgs.push(`--provider=${opts.provider}`);
			if (opts.repo) childArgs.push(`--repo=${opts.repo}`);
			if (opts.event) childArgs.push(`--event=${opts.event}`);
			if (opts.pullRequestNumber)
				childArgs.push(`--pull-request-number=${opts.pullRequestNumber}`);
			if (opts.pullRequestUrl) childArgs.push(`--pull-request-url=${opts.pullRequestUrl}`);
			if (opts.skipDnsValidation) childArgs.push('--skip-dns-validation');
			if (opts.skipTypeCheck) childArgs.push('--skip-type-check');
			if (opts.metadata) childArgs.push(`--metadata=${opts.metadata}`);
			// Preserve multi-env flags so the child reloads the same project
			// config and env files (parent already applied env to process.env,
			// but Sync Env re-reads files by path).
			if (projectConfigPath) {
				childArgs.push(`--project-config=${projectConfigPath}`);
			}
			const envFiles = options.env;
			if (Array.isArray(envFiles)) {
				for (const envFile of envFiles) {
					childArgs.push(`--env=${envFile}`);
				}
			}

			const result = await runForkedDeploy({
				projectDir,
				apiClient,
				logger,
				sdkKey: sdkKey!,
				deployment: initialDeployment,
				args: childArgs,
			});

			if (!result.success) {
				const appUrl = getAppBaseURL(
					process.env.AGENTUITY_REGION ?? config?.name,
					config?.overrides
				);
				const deploymentLink = `${appUrl}/projects/${project.projectId}/deployments/${initialDeployment.id}`;
				tui.fatal(
					`Deployment failed: ${tui.link(deploymentLink, 'Deployment Page')}`,
					ErrorCode.BUILD_FAILED
				);
			}

			return {
				success: true,
				deploymentId: initialDeployment.id,
				projectId: project.projectId,
				logs: result.deployResult?.logs,
				urls: result.deployResult?.urls,
			};
		}
		let useExistingDeployment = false;
		if (deploymentEnv) {
			const ExistingDeploymentSchema = z.object({
				id: z.string(),
				orgId: z.string(),
				publicKey: z.string(),
			});
			try {
				const parsed = JSON.parse(deploymentEnv);
				const result = ExistingDeploymentSchema.safeParse(parsed);
				if (result.success) {
					deployment = result.data;
					useExistingDeployment = true;
					logger.debug('Using existing deployment: %s', result.data.id);
				} else {
					const errors = result.error.issues
						.map((i) => `${i.path.join('.')}: ${i.message}`)
						.join(', ');
					logger.fatal(`Invalid AGENTUITY_DEPLOYMENT schema: ${errors}`);
				}
			} catch (err) {
				logger.fatal(`Failed to parse AGENTUITY_DEPLOYMENT: ${err}`);
			}
		}

		// Create a unified abort controller for the entire deploy flow
		const deployAbortController = new AbortController();
		const deployAbortHandler = () => {
			deployAbortController.abort();
		};
		process.on('SIGINT', deployAbortHandler);

		// Start malware check async (runs in parallel with build)
		if (deployment) {
			malwareCheckPromise = (async () => {
				try {
					logger.debug('Starting malware dependency check');
					const packages = await extractDependencies(projectDir, logger);
					if (packages.length === 0) {
						logger.debug('No packages to check for malware');
						return null;
					}
					logger.debug('Checking %d packages for malware', packages.length);
					// Use Catalyst client directly for malware check (security routes are on Catalyst)
					const catalystClient = await getGlobalCatalystAPIClient(
						logger,
						auth,
						config?.name,
						undefined,
						config
					);
					const result = await projectDeploymentMalwareCheck(
						catalystClient,
						deployment!.id,
						packages,
						deployAbortController.signal
					);
					logger.debug(
						'Malware check complete: action=%s, flagged=%d',
						result.action,
						result.summary.flagged
					);
					return result;
				} catch (error) {
					logger.warn('Malware check failed: %s', error);
					return null;
				}
			})();
		}

		try {
			await saveProjectDir(projectDir);

			// Check GitHub status and prompt for setup if not linked
			// Skip in non-TTY environments (CI, automated runs) to prevent hanging
			if (!useExistingDeployment && !project.skipGitSetup && hasTTY) {
				try {
					const githubStatus = await getProjectGithubStatus(apiClient, project.projectId);

					if (githubStatus.linked && githubStatus.autoDeploy) {
						// GitHub is already set up with auto-deploy, tell user to push instead
						tui.newline();
						tui.info(
							`This project is linked to ${tui.bold(githubStatus.repoFullName ?? 'GitHub')} with automatic deployments enabled.`
						);
						tui.newline();
						tui.info(
							`Push a commit to the ${tui.bold(githubStatus.branch ?? 'main')} branch to trigger a deployment.`
						);
						tui.newline();
						throw new DeploymentCancelledError();
					}

					if (!githubStatus.linked) {
						tui.newline();
						const wantSetup = await tui.confirm(
							'Would you like to set up automatic deployments from GitHub?'
						);

						if (wantSetup) {
							const result = await runGitLink({
								apiClient,
								projectId: project.projectId,
								logger,
								skipAlreadyLinkedCheck: true,
								config,
							});

							if (result.linked && result.autoDeploy) {
								// GitHub linked with auto-deploy, tell user to push instead
								tui.newline();
								tui.info('GitHub integration set up successfully!');
								tui.newline();
								tui.info('Push a commit to trigger your first deployment.');
								tui.newline();
								throw new DeploymentCancelledError();
							}
							if (result.linked) {
								// Linked but auto-deploy disabled, continue with manual deploy
								tui.newline();
								tui.info('GitHub repository linked. Continuing with deployment...');
								tui.newline();
							}
						} else {
							await updateProjectConfig(
								projectDir,
								{ skipGitSetup: true },
								config,
								projectConfigOpts
							);
							tui.newline();
							tui.info(
								`Skipping GitHub setup. Run ${tui.bold(getCommand('git link'))} later to enable it.`
							);
							tui.newline();
						}
					}
				} catch (err) {
					// Re-throw intentional cancellations
					if (err instanceof DeploymentCancelledError) {
						throw err;
					}
					// Log other errors as non-fatal and continue
					logger.trace('Failed to check GitHub status: %s', err);
				}
			}

			await runSteps(
				[
					// Detect Project — runs once, caches the result on pipelineState
					// for the build step below to reuse. Skipped in child mode
					// because the parent process already validated the project and
					// the duplicate output would just clutter the deploy log.
					isChildProcess ? null : buildDiscoverStep(projectDir, logger, pipelineState),
					opts.skipDnsValidation || !project.deployment?.domains?.length
						? null
						: {
								label: `Validate Custom ${tui.plural(project.deployment.domains.length, 'Domain', 'Domains')}`,
								run: async () => {
									if (project.deployment?.domains?.length) {
										try {
											await domain.promptForDNS(
												project.projectId,
												project.deployment.domains,
												project.region,
												config!,
												() => pauseStepUI(true)
											);
											return stepSuccess();
										} catch (ex) {
											return stepError(String(ex), ex as Error);
										}
									}
									return stepSkipped();
								},
							},
					{
						label: 'Sync Env & Secrets',
						run: async () => {
							try {
								const isCIBuild =
									useExistingDeployment && process.env.AGENTUITY_FORK_PARENT !== '1';
								if (isCIBuild) {
									return stepSkipped('skipped in CI build');
								}
								// Read env file(s) — honors global `--env` (layered)
								const { vars: localEnv } = await loadProjectEnvVars(
									projectDir,
									options.env
								);

								// Filter out AGENTUITY_ keys
								const filteredEnv = filterAgentuitySdkKeys(localEnv);

								if (Object.keys(filteredEnv).length === 0) {
									return stepSkipped('no variables to sync');
								}

								// Split into env and secrets
								const { env, secrets } = splitEnvAndSecrets(filteredEnv);

								if (Object.keys(env).length === 0 && Object.keys(secrets).length === 0) {
									return stepSkipped('no variables to sync');
								}

								// Push to cloud
								await projectEnvUpdate(apiClient, {
									id: project.projectId,
									env,
									secrets,
								});

								return stepSuccess();
							} catch (ex) {
								// Non-fatal: log warning but continue deployment
								const _ex = ex as Error;
								return stepSkipped(_ex.message ?? 'failed to sync env variables');
							}
						},
					},

					buildBuildStep({
						project,
						projectDir,
						apiClient,
						logger,
						collector,
						deployment,
						deployOptions: opts,
						hasReportFile: Boolean(opts.reportFile),
						state: pipelineState,
						config,
					}),
					{
						label: 'Security Scan',
						run: async () => {
							if (!malwareCheckPromise) {
								return stepSkipped('malware check not started');
							}

							const result = await malwareCheckPromise;
							if (!result) {
								return stepSkipped('malware check unavailable');
							}

							if (result.action === 'block' && result.findings.length > 0) {
								if (opts.reportFile) {
									for (const finding of result.findings) {
										collector.addGeneralError(
											'deploy',
											`Malicious package: ${finding.name}@${finding.version} (${finding.reason})`
										);
									}
									await collector.forceWrite();
								}

								const packageList = result.findings
									.map((f) => `• ${f.name}@${f.version} (${f.reason})`)
									.join('\n');

								// Pause step UI to cleanly render error box
								pauseStepUI(true);

								tui.newline();
								tui.errorBox(
									'Malicious Packages Detected',
									`Your deployment was blocked because it contains known malicious packages:\n\n${packageList}\n\nRemove these packages from your project and try again.`
								);
								tui.newline();

								process.exit(getExitCode(ErrorCode.MALWARE_DETECTED));
							}

							return stepSuccess([`Scanned ${result.summary.scanned} packages`]);
						},
					},
					buildEncryptUploadStep({
						projectDir,
						collector,
						deployment,
						hasReportFile: Boolean(opts.reportFile),
						state: pipelineState,
						logger,
					}),
					buildProvisionStep({
						apiClient,
						deployment,
						completeRef,
					}),
				].filter(Boolean) as Step[],
				options.logLevel
			);

			// Drain the provision step's ref-cell into the local `complete`
			// the wait phase still uses inline. (Wait phase will be
			// extracted into deploy/wait.ts in a follow-up edit.)
			const complete = completeRef.current;

			if (!deployment) {
				return {
					success: false,
					deploymentId: '',
					projectId: project.projectId,
				};
			}

			// TODO: send the deployment failure to the backend otherwise we staying in a deploying state

			// Compute the dashboard URL once — it's referenced both by the
			// wait phase (failure banner) and by the success URL rendering
			// below, plus included in the deploy result and JSON output.
			const appUrl = getAppBaseURL(
				process.env.AGENTUITY_REGION ?? config?.name,
				config?.overrides
			);
			const dashboard = `${appUrl}/r/${deployment.id}`;

			// Wait for the deployment to finish warming up unless --no-wait was
			// passed. In JSON mode use the headless wait primitive so agents get
			// structured status instead of TUI spinners.
			const shouldWait = opts.wait !== false;
			try {
				if (shouldWait) {
					if (isJSONMode(options)) {
						const waitResult = await waitForDeployment({
							apiClient,
							projectId: project.projectId,
							deploymentId: deployment.id,
							config,
							logger,
							timeoutMs: parseDurationMs(opts.timeout ?? '10m'),
							abortSignal: deployAbortController.signal,
							projectDir,
						});
						if (waitResult.recentLogs?.length) {
							logs.push(...waitResult.recentLogs);
						}
						if (!waitResult.success) {
							const fallbackUrl = dashboard;
							return {
								success: false,
								deploymentId: deployment.id,
								projectId: project.projectId,
								logs,
								urls: {
									deployment:
										complete?.publicUrls?.vanityDeployment ??
										complete?.publicUrls?.deployment ??
										fallbackUrl,
									latest:
										complete?.publicUrls?.vanityProject ??
										complete?.publicUrls?.latest ??
										fallbackUrl,
									custom: complete?.publicUrls?.custom,
									dashboard,
								},
							};
						}
					} else {
						await runWaitForDeployment({
							apiClient,
							deployment,
							complete,
							collector,
							hasReportFile: Boolean(opts.reportFile),
							logger,
							config,
							region: project.region,
							sdkKey: sdkKey!,
							abortSignal: deployAbortController.signal,
							logs,
						});
					}
				}
			} finally {
				// Clean up signal handler
				process.off('SIGINT', deployAbortHandler);
			}
			// Show deployment URLs
			if (complete?.publicUrls && !options.json) {
				const lines: string[] = [];
				if (complete.publicUrls.custom?.length) {
					for (const url of complete.publicUrls.custom) {
						lines.push(
							`${tui.ICONS.arrow} ${tui.bold(tui.padRight('Deployment:', 12)) + tui.link(url)}`
						);
					}
				} else {
					// Prefer vanity URLs, fall back to hash-based
					const deploymentUrl =
						complete.publicUrls.vanityDeployment ?? complete.publicUrls.deployment;
					const latestUrl = complete.publicUrls.vanityProject ?? complete.publicUrls.latest;
					lines.push(
						`${tui.ICONS.arrow} ${
							tui.bold(tui.padRight('Deployment:', 12)) + tui.link(deploymentUrl)
						}`
					);
					lines.push(
						`${tui.ICONS.arrow} ${tui.bold(tui.padRight('Project:', 12)) + tui.link(latestUrl)}`
					);
				}
				lines.push(
					`${tui.ICONS.arrow} ${tui.bold(tui.padRight('Dashboard:', 12)) + tui.link(dashboard)}`
				);
				tui.banner(`Deployment: ${tui.colorPrimary(deployment.id)}`, lines.join('\n'), {
					centerTitle: false,
					topSpacer: false,
					bottomSpacer: false,
				});
			}

			// Trigger TLS certificate provisioning for custom domains (fire-and-forget)
			if (project.deployment?.domains?.length) {
				void domain.triggerTLSProvisioning(project.deployment.domains);
			}

			// Write final report on success
			if (opts.reportFile) {
				await collector.forceWrite();
			}
			clearGlobalCollector();

			// Write deploy result to file for fork parent to consume
			const deployResultFile = process.env.AGENTUITY_DEPLOY_RESULT_FILE;
			if (deployResultFile) {
				try {
					const resultData = {
						urls: complete?.publicUrls
							? {
									deployment:
										complete.publicUrls.vanityDeployment ??
										complete.publicUrls.deployment,
									latest: complete.publicUrls.vanityProject ?? complete.publicUrls.latest,
									custom: complete.publicUrls.custom,
									dashboard,
								}
							: undefined,
						logs,
					};
					writeFileSync(deployResultFile, JSON.stringify(resultData));
				} catch {
					// Non-fatal: result file is optional
				}
			}

			return {
				success: true,
				deploymentId: deployment.id,
				projectId: project.projectId,
				rolloutId: complete?.rolloutId,
				logs,
				urls: complete?.publicUrls
					? {
							deployment:
								complete.publicUrls.vanityDeployment ?? complete.publicUrls.deployment,
							latest: complete.publicUrls.vanityProject ?? complete.publicUrls.latest,
							custom: complete.publicUrls.custom,
							dashboard,
						}
					: undefined,
			};
		} catch (ex) {
			// Handle step interruption (Ctrl+C during build steps)
			if (ex instanceof StepInterruptError) {
				tui.warning('Deployment cancelled');
				process.exit(ex.exitCode);
			}
			collector.addGeneralError('deploy', String(ex), 'DEPLOY004');
			if (opts.reportFile) {
				await collector.forceWrite();
			}
			clearGlobalCollector();
			tui.fatal(`unexpected error trying to deploy project. ${ex}`);
		} finally {
			process.off('SIGINT', deployAbortHandler);
		}
	},
});
