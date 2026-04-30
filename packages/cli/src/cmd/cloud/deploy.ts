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
import { BuildReportCollector, clearGlobalCollector, setGlobalCollector } from '../../build-report';
import { getCommand } from '../../command-prefix';
import {
	getGlobalCatalystAPIClient,
	loadProjectSDKKey,
	saveProjectDir,
	updateProjectConfig,
} from '../../config';
import * as domain from '../../domain';
import {
	filterAgentuitySdkKeys,
	findExistingEnvFile,
	readEnvFile,
	splitEnvAndSecrets,
} from '../../env-util';
import { ErrorCode, getExitCode } from '../../errors';
import {
	pauseStepUI,
	runSteps,
	type Step,
	StepInterruptError,
	stepError,
	stepSkipped,
	stepSuccess,
} from '../../steps';
import * as tui from '../../tui';
import { createSubcommand, DeployOptionsSchema } from '../../types';
import { extractDependencies } from '../../utils/deps';
import { buildBuildStep } from './deploy/build';
import { buildDiscoverStep } from './deploy/discover';
import { PreflightAptValidationError, runPreflight } from './deploy/preflight';
import { runRegister } from './deploy/register';
import type { DeployPipelineState } from './deploy/types';
import { buildEncryptUploadStep, buildProvisionStep } from './deploy/upload';
import { runWaitForDeployment } from './deploy/wait';
import { getProjectGithubStatus } from '../git/api';
import { runGitLink } from '../git/link';
import { runForkedDeploy } from './deploy-fork';

const DeploymentCancelledError = StructuredError(
	'DeploymentCancelled',
	'Deployment cancelled by user'
);

const DeployResponseSchema = z.object({
	success: z.boolean().describe('Whether deployment succeeded'),
	deploymentId: z.string().describe('Deployment ID'),
	projectId: z.string().describe('Project ID'),
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
	],
	toplevel: true,
	idempotent: false,
	// `project` is optional at the CLI gate level: in a vanilla JS/TS dir we
	// want `agentuity deploy` to work end-to-end (discover -> register ->
	// deploy) without first running `agentuity project import`. The handler
	// below guarantees a registered project before any deploy work happens
	// via the Register phase (`reconcileProject`).
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
		const { apiClient, projectDir, config, options, logger, opts, auth } = ctx;

		// Mutable, shared accumulator threaded through the deploy steps.
		// Each phase writes its own outputs onto this object so later steps
		// can read them without ballooning the step factory signatures.
		const pipelineState: DeployPipelineState = {};

		// Resolve a registered project for this directory. Under `optional.project`
		// the cli.ts gate may hand us `ctx.project=undefined` (no agentuity.json);
		// the Register phase guarantees a real project is in hand before any
		// deploy work happens, registering/importing one if necessary.
		const { isTTY } = await import('../../auth');
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
							await updateProjectConfig(projectDir, { skipGitSetup: true }, config);
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
					!project.deployment?.domains?.length
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
								// Read env file
								const envFilePath = await findExistingEnvFile(projectDir);
								const localEnv = await readEnvFile(envFilePath);

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

			// Wait for the deployment to finish warming up. The phase handles
			// log streaming, status polling, Ctrl+C cancellation, and the
			// failure banner; on success it just returns and we render the
			// success URLs below.
			try {
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
