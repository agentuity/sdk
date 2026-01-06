import { z } from 'zod';
import { join, resolve } from 'node:path';
import { createPublicKey } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { StructuredError } from '@agentuity/core';
import { isRunningFromExecutable } from '../upgrade';
import { createSubcommand, DeployOptionsSchema } from '../../types';
import { getUserAgent } from '../../api';
import * as tui from '../../tui';
import {
	saveProjectDir,
	getDefaultConfigDir,
	loadProjectSDKKey,
	updateProjectConfig,
} from '../../config';
import { getProjectGithubStatus } from '../integration/api';
import { runGitLink } from '../git/link';
import {
	runSteps,
	stepSuccess,
	stepSkipped,
	stepError,
	pauseStepUI,
	type Step,
	type StepContext,
} from '../../steps';
import { viteBundle } from '../build/vite-bundler';
import { loadBuildMetadata, getStreamURL } from '../../config';
import {
	projectEnvUpdate,
	projectDeploymentCreate,
	projectDeploymentUpdate,
	projectDeploymentComplete,
	projectDeploymentStatus,
	type Deployment,
	type BuildMetadata,
	type DeploymentInstructions,
	type DeploymentComplete,
	type DeploymentStatusResult,
	getAppBaseURL,
} from '@agentuity/server';
import {
	findExistingEnvFile,
	readEnvFile,
	filterAgentuitySdkKeys,
	splitEnvAndSecrets,
} from '../../env-util';
import { zipDir } from '../../utils/zip';
import { encryptFIPSKEMDEMStream } from '../../crypto/box';
import { getCommand } from '../../command-prefix';
import * as domain from '../../domain';
import { ErrorCode } from '../../errors';
import { typecheck } from '../build/typecheck';
import { BuildReportCollector, setGlobalCollector, clearGlobalCollector } from '../../build-report';
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
	tags: [
		'mutating',
		'creates-resource',
		'slow',
		'api-intensive',
		'requires-auth',
		'requires-project',
	],
	examples: [
		{ command: getCommand('cloud deploy'), description: 'Deploy current project' },
		{
			command: getCommand('cloud deploy --log-level=debug'),
			description: 'Deploy with verbose output',
		},
	],
	toplevel: true,
	idempotent: false,
	requires: { auth: true, project: true, apiClient: true },
	prerequisites: ['auth login'],
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
			})
		),
		response: DeployResponseSchema,
	},

	async handler(ctx) {
		const { project, apiClient, projectDir, config, options, logger, opts } = ctx;

		// Initialize build report collector if reportFile is specified
		const collector = new BuildReportCollector();
		if (opts.reportFile) {
			collector.setOutputPath(opts.reportFile);
			collector.enableAutoWrite();
			setGlobalCollector(collector);
		}

		let deployment: Deployment | undefined;
		let build: BuildMetadata | undefined;
		let instructions: DeploymentInstructions | undefined;
		let complete: DeploymentComplete | undefined;
		let statusResult: DeploymentStatusResult | undefined;
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

			// First, create the deployment to get the ID, publicKey, and stream URL
			const deploymentConfig = project.deployment ?? {};
			const initialDeployment = await projectDeploymentCreate(
				apiClient,
				project.projectId,
				deploymentConfig
			);

			logger.debug('Created deployment: %s', initialDeployment.id);

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

		try {
			await saveProjectDir(projectDir);

			// Check GitHub status and prompt for setup if not linked
			// Skip in non-TTY environments (CI, automated runs) to prevent hanging
			const hasTTY = process.stdin.isTTY && process.stdout.isTTY;
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
								orgId: project.orgId,
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
							} else if (result.linked) {
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
					{
						label: 'Create Deployment',
						run: async () => {
							if (useExistingDeployment) {
								return stepSkipped('using pre-created deployment');
							}
							try {
								deployment = await projectDeploymentCreate(
									apiClient,
									project.projectId,
									project.deployment
								);
								return stepSuccess();
							} catch (ex) {
								const _ex = ex as { message?: string };
								return stepError(_ex.message ?? String(_ex), ex as Error);
							}
						},
					},
					{
						label: 'Build, Verify and Package',
						run: async () => {
							if (!deployment) {
								return stepError('deployment was null');
							}
							let capturedOutput: string[] = [];
							const rootDir = resolve(projectDir);

							// Run typecheck with collector for error reporting
							const endTypecheckDiagnostic = collector.startDiagnostic('typecheck');
							const started = Date.now();
							const typeResult = await typecheck(rootDir, { collector });
							endTypecheckDiagnostic();

							if (typeResult.success) {
								capturedOutput.push(
									tui.muted(
										`✓ Typechecked in ${Math.floor(Date.now() - started).toFixed(0)}ms`
									)
								);
							} else {
								// Errors already added to collector by typecheck()
								// Write report before returning error
								if (opts.reportFile) {
									await collector.forceWrite();
								}
								return stepError('Typecheck failed\n\n' + typeResult.output);
							}
							try {
								const bundleResult = await viteBundle({
									rootDir,
									dev: false,
									deploymentId: deployment.id,
									orgId: deployment.orgId,
									projectId: project.projectId,
									region: project.region,
									logger: ctx.logger,
									deploymentOptions: opts,
									collector,
								});
								capturedOutput = [...capturedOutput, ...bundleResult.output];
								build = await loadBuildMetadata(join(projectDir, '.agentuity'));
								instructions = await projectDeploymentUpdate(
									apiClient,
									deployment.id,
									build
								);
								return stepSuccess(capturedOutput.length > 0 ? capturedOutput : undefined);
							} catch (ex) {
								const _ex = ex as Error;
								// Write report before returning error
								if (opts.reportFile) {
									await collector.forceWrite();
								}
								return stepError(
									_ex.message ?? 'Error building your project',
									_ex,
									capturedOutput.length > 0 ? capturedOutput : undefined
								);
							}
						},
					},
					{
						label: 'Encrypt and Upload Deployment',
						run: async (stepCtx: StepContext) => {
							const progress = stepCtx.progress;
							if (!deployment) {
								return stepError('deployment was null');
							}
							if (!instructions) {
								return stepError('deployment instructions were null');
							}

							// Start diagnostic for zip/encrypt phase
							const endZipDiagnostic = collector.startDiagnostic('zip-package');
							progress(5);
							ctx.logger.trace('Starting deployment zip creation');
							// zip up the assets folder
							const deploymentZip = join(tmpdir(), `${deployment.id}.zip`);
							await zipDir(join(projectDir, '.agentuity'), deploymentZip, {
								filter: (_filename: string, relative: string) => {
									if (relative.startsWith('.vite/')) {
										return false;
									}
									if (relative.startsWith('workbench-src/')) {
										return false;
									}
									if (relative.startsWith('workbench/')) {
										return false;
									}
									// ignore common stuff we never want to include in the zip
									if (relative.startsWith('.env')) return false;
									if (relative.startsWith('.git/')) return false;
									if (relative.startsWith('.ssh/')) return false;
									if (relative === '.DS_Store') return false;
									return true;
								},
							});
							ctx.logger.trace(`Deployment zip created: ${deploymentZip}`);

							endZipDiagnostic();

							progress(20);
							// Encrypt the deployment zip using the public key from deployment
							const endEncryptDiagnostic = collector.startDiagnostic('encrypt');
							const encryptedZip = join(tmpdir(), `${deployment.id}.enc.zip`);
							try {
								ctx.logger.trace('Creating public key');
								const publicKey = createPublicKey({
									key: deployment.publicKey,
									format: 'pem',
									type: 'spki',
								});

								ctx.logger.trace('Creating read/write streams');
								const src = createReadStream(deploymentZip);
								const dst = createWriteStream(encryptedZip);

								ctx.logger.trace('Starting encryption');
								// Wait for encryption to complete
								await encryptFIPSKEMDEMStream(publicKey, src, dst);
								ctx.logger.trace('Encryption complete');

								progress(40);
								ctx.logger.trace('Waiting for stream to finish');
								// End stream and wait for it to finish writing
								await new Promise<void>((resolve, reject) => {
									dst.once('finish', resolve);
									dst.once('error', reject);
									dst.end();
								});
								ctx.logger.trace('Stream finished');
								endEncryptDiagnostic();

								progress(50);
								// Start code upload diagnostic
								const endCodeUploadDiagnostic = collector.startDiagnostic('code-upload');
								ctx.logger.trace(`Uploading deployment to ${instructions.deployment}`);
								const zipfile = Bun.file(encryptedZip);
								const fileSize = await zipfile.size;
								ctx.logger.trace(`Upload file size: ${fileSize} bytes`);
								const resp = await fetch(instructions.deployment, {
									method: 'PUT',
									duplex: 'half',
									headers: {
										'Content-Type': 'application/zip',
									},
									body: zipfile,
								});
								ctx.logger.trace(`Upload response: ${resp.status}`);
								if (!resp.ok) {
									endCodeUploadDiagnostic();
									const errorMsg = `Error uploading deployment: ${await resp.text()}`;
									collector.addGeneralError('deploy', errorMsg, 'DEPLOY002');
									if (opts.reportFile) {
										await collector.forceWrite();
									}
									return stepError(errorMsg);
								}
								endCodeUploadDiagnostic();

								progress(70);
								ctx.logger.trace('Consuming response body');
								// Wait for response body to be consumed before deleting
								await resp.arrayBuffer();
								ctx.logger.trace('Deleting encrypted zip');
								await zipfile.delete();
							} finally {
								ctx.logger.trace('Cleanup');
								// Cleanup in case of error
								if (await Bun.file(encryptedZip).exists()) {
									await Bun.file(encryptedZip).delete();
								}
								await Bun.file(deploymentZip).delete();
							}

							progress(80);
							let bytes = 0;
							if (build?.assets) {
								// Start CDN upload diagnostic
								const endCdnUploadDiagnostic = collector.startDiagnostic('cdn-upload');
								ctx.logger.trace(`Uploading ${build.assets.length} assets`);
								if (!instructions.assets) {
									const errorMsg =
										'server did not provide asset upload URLs; upload aborted';
									collector.addGeneralError('deploy', errorMsg, 'DEPLOY006');
									if (opts.reportFile) {
										await collector.forceWrite();
									}
									return stepError(errorMsg);
								}

								// Workaround for Bun crash in compiled executables (https://github.com/agentuity/sdk/issues/191)
								// Use limited concurrency (1 at a time) for executables to avoid parallel fetch crash
								const isExecutable = isRunningFromExecutable();
								const concurrency = isExecutable ? 1 : Math.min(4, build.assets.length);

								if (isExecutable) {
									ctx.logger.trace(
										`Running from executable - using limited concurrency (${concurrency} uploads at a time)`
									);
								}

								// Process assets in batches with limited concurrency
								for (let i = 0; i < build.assets.length; i += concurrency) {
									const batch = build.assets.slice(i, i + concurrency);
									const promises: Promise<Response>[] = [];

									for (const asset of batch) {
										const assetUrl = instructions.assets[asset.filename];
										if (!assetUrl) {
											return stepError(
												`server did not provide upload URL for asset "${asset.filename}"; upload aborted`
											);
										}

										// Asset filename already includes the subdirectory (e.g., "client/assets/main-abc123.js")
										const filePath = join(projectDir, '.agentuity', asset.filename);

										const headers: Record<string, string> = {
											'Content-Type': asset.contentType,
										};

										bytes += asset.size;

										let body: Uint8Array | Blob;
										if (asset.contentEncoding === 'gzip') {
											const file = Bun.file(filePath);
											const ab = await file.arrayBuffer();
											const gzipped = Bun.gzipSync(new Uint8Array(ab));
											headers['Content-Encoding'] = 'gzip';
											body = gzipped;
											ctx.logger.trace(
												`Compressing ${asset.filename} (${asset.size} -> ${gzipped.byteLength} bytes)`
											);
										} else {
											body = Bun.file(filePath);
										}

										promises.push(
											fetch(assetUrl, {
												method: 'PUT',
												duplex: 'half',
												headers,
												body,
											})
										);
									}

									const resps = await Promise.all(promises);
									for (const r of resps) {
										if (!r.ok) {
											const errorMsg = `error uploading asset: ${await r.text()}`;
											collector.addGeneralError('deploy', errorMsg, 'DEPLOY006');
											if (opts.reportFile) {
												await collector.forceWrite();
											}
											return stepError(errorMsg);
										}
									}
								}
								ctx.logger.trace('Asset uploads complete');
								endCdnUploadDiagnostic();
								progress(95);
							}

							progress(100);
							const output = build?.assets.length
								? [
										tui.muted(
											`✓ Uploaded ${build.assets.length} ${tui.plural(build.assets.length, 'asset', 'assets')} (${tui.formatBytes(bytes)}) to CDN`
										),
									]
								: undefined;
							return stepSuccess(output);
						},
					},
					{
						label: 'Provision Deployment',
						run: async () => {
							if (!deployment) {
								return stepError('deployment was null');
							}
							complete = await projectDeploymentComplete(apiClient, deployment.id);
							return stepSuccess();
						},
					},
				].filter(Boolean) as Step[],
				options.logLevel
			);

			if (!deployment) {
				return {
					success: false,
					deploymentId: '',
					projectId: project.projectId,
				};
			}

			// TODO: send the deployment failure to the backend otherwise we staying in a deploying state

			const streamId = complete?.streamId;
			const appUrl = getAppBaseURL(
				process.env.AGENTUITY_REGION ?? config?.name,
				config?.overrides
			);
			const dashboard = `${appUrl}/r/${deployment.id}`;

			// Poll for deployment status with optional log streaming
			const endDeploymentWaitDiagnostic = collector.startDiagnostic('deployment-wait');
			const pollInterval = 500;
			const maxAttempts = 600;
			let attempts = 0;

			// Create abort controller to allow Ctrl+C to interrupt polling
			const pollAbortController = new AbortController();
			const sigintHandler = () => {
				pollAbortController.abort();
			};
			process.on('SIGINT', sigintHandler);

			try {
				if (streamId) {
					// Use progress logger to stream logs while polling
					const streamsUrl = getStreamURL(project.region, config);

					await tui
						.progress({
							message: 'Deploying project...',
							type: 'logger',
							maxLines: 2,
							clearOnSuccess: true,
							callback: async (log) => {
								// Start log streaming
								const logStreamController = new AbortController();
								const logStreamPromise = (async () => {
									try {
										logger.debug('fetching stream: %s/%s', streamsUrl, streamId);
										const resp = await fetch(`${streamsUrl}/${streamId}`, {
											signal: logStreamController.signal,
											headers: {
												Authorization: `Bearer ${sdkKey}`,
												'User-Agent': getUserAgent(),
											},
										});
										if (!resp.ok || !resp.body) {
											ctx.logger.trace(
												`Failed to connect to warmup log stream: ${resp.status}`
											);
											return;
										}
										const reader = resp.body.getReader();
										const decoder = new TextDecoder();
										let buffer = '';
										while (true) {
											const { done, value } = await reader.read();
											if (done) break;
											buffer += decoder.decode(value, { stream: true });
											const lines = buffer.split('\n');
											buffer = lines.pop() || ''; // Keep incomplete line in buffer
											for (const line of lines) {
												// Strip ISO 8601 timestamp prefix if present
												const message = line.replace(
													/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z\s?/,
													''
												);
												if (message) {
													logs.push(message);
													log(message);
												}
											}
										}
									} catch (err) {
										if (err instanceof Error && err.name === 'AbortError') {
											return;
										}
										ctx.logger.trace(`Warmup log stream error: ${err}`);
									}
								})();

								// Poll for deployment status
								while (attempts < maxAttempts) {
									// Check if user pressed Ctrl+C
									if (pollAbortController.signal.aborted) {
										logStreamController.abort();
										throw new DeploymentCancelledError();
									}

									attempts++;
									try {
										statusResult = await projectDeploymentStatus(
											apiClient,
											deployment?.id ?? ''
										);

										logger.trace('status result: %s', statusResult);

										if (statusResult.state === 'completed') {
											logStreamController.abort();
											break;
										}

										if (statusResult.state === 'failed') {
											throw new Error('Deployment failed');
										}

										await Bun.sleep(pollInterval);
									} catch (err) {
										logStreamController.abort();
										throw err;
									}
								}

								// Wait for log stream to finish
								await logStreamPromise;

								if (attempts >= maxAttempts) {
									throw new Error('Deployment timed out');
								}
							},
						})
						.then(() => {
							endDeploymentWaitDiagnostic();
							tui.success('Your project was deployed!');
						})
						.catch(async (ex) => {
							endDeploymentWaitDiagnostic();
							// Handle cancellation
							if (ex instanceof DeploymentCancelledError) {
								if (opts.reportFile) {
									await collector.forceWrite();
								}
								tui.warning('Deployment cancelled');
								process.exit(130); // Standard exit code for SIGINT
							}
							const exwithmessage = ex as { message: string };
							const msg =
								exwithmessage.message === 'Deployment failed'
									? ''
									: exwithmessage.toString();

							// Add error to collector
							const isTimeout = exwithmessage.message === 'Deployment timed out';
							collector.addGeneralError(
								'deploy',
								msg || 'Deployment failed',
								isTimeout ? 'DEPLOY003' : 'DEPLOY004'
							);
							if (opts.reportFile) {
								await collector.forceWrite();
							}

							tui.error(`Your deployment failed to start${msg ? `: ${msg}` : ''}`);
							if (logs.length) {
								const logsDir = join(getDefaultConfigDir(), 'logs');
								if (!existsSync(logsDir)) {
									mkdirSync(logsDir, { recursive: true });
								}
								const errorFile = join(logsDir, `${deployment?.id ?? Date.now()}.txt`);
								writeFileSync(errorFile, logs.join('\n'));
								const count = Math.min(logs.length, 10);
								const last = logs.length - count;
								tui.newline();
								tui.warning(`The last ${count} lines of the log:`);
								let offset = last + 1; // we want to show the offset from inside the log starting at 1
								const max = String(logs.length).length;
								for (const _log of logs.slice(last)) {
									console.log(tui.muted(`${offset.toFixed().padEnd(max)} | ${_log}`));
									offset++;
								}
								tui.newline();
								tui.fatal(`The logs were written to ${errorFile}`, ErrorCode.BUILD_FAILED);
							}
							tui.fatal('Deployment failed', ErrorCode.BUILD_FAILED);
						});
				} else {
					// No stream ID - poll without log streaming
					await tui.spinner({
						message: 'Deploying project...',
						type: 'simple',
						clearOnSuccess: true,
						callback: async () => {
							while (attempts < maxAttempts) {
								// Check if user pressed Ctrl+C
								if (pollAbortController.signal.aborted) {
									throw new DeploymentCancelledError();
								}

								attempts++;
								statusResult = await projectDeploymentStatus(
									apiClient,
									deployment?.id ?? ''
								);

								if (statusResult.state === 'completed') {
									break;
								}

								if (statusResult.state === 'failed') {
									throw new Error('Deployment failed');
								}

								await Bun.sleep(pollInterval);
							}

							if (attempts >= maxAttempts) {
								throw new Error('Deployment timed out');
							}
						},
					});

					endDeploymentWaitDiagnostic();
					tui.success('Your project was deployed!');
				}
			} catch (ex) {
				endDeploymentWaitDiagnostic();
				const exwithmessage = ex as { message: string };
				const isTimeout = exwithmessage?.message === 'Deployment timed out';
				collector.addGeneralError(
					'deploy',
					exwithmessage?.message || String(ex),
					isTimeout ? 'DEPLOY003' : 'DEPLOY004'
				);
				if (opts.reportFile) {
					await collector.forceWrite();
				}

				const lines = [`${ex}`, ''];
				lines.push(
					`${tui.ICONS.arrow} ${
						tui.bold(tui.padRight('Dashboard:', 12)) + tui.link(dashboard)
					}`
				);
				tui.banner(tui.colorError(`Deployment: ${deployment.id} Failed`), lines.join('\n'), {
					centerTitle: false,
					topSpacer: false,
					bottomSpacer: false,
				});
				tui.fatal('Deployment failed', ErrorCode.BUILD_FAILED);
			} finally {
				// Clean up signal handler
				process.off('SIGINT', sigintHandler);
			}

			// Show deployment URLs
			if (complete?.publicUrls) {
				const lines: string[] = [];
				if (complete.publicUrls.custom?.length) {
					for (const url of complete.publicUrls.custom) {
						lines.push(
							`${tui.ICONS.arrow} ${tui.bold(tui.padRight('Deployment:', 12)) + tui.link(url)}`
						);
					}
				} else {
					lines.push(
						`${tui.ICONS.arrow} ${
							tui.bold(tui.padRight('Deployment:', 12)) +
							tui.link(complete.publicUrls.deployment)
						}`
					);
					lines.push(
						`${tui.ICONS.arrow} ${
							tui.bold(tui.padRight('Project:', 12)) + tui.link(complete.publicUrls.latest)
						}`
					);
				}
				lines.push(
					`${tui.ICONS.arrow} ${
						tui.bold(tui.padRight('Dashboard:', 12)) + tui.link(dashboard)
					}`
				);
				tui.banner(`Deployment: ${tui.colorPrimary(deployment.id)}`, lines.join('\n'), {
					centerTitle: false,
					topSpacer: false,
					bottomSpacer: false,
				});
			}

			// Write final report on success
			if (opts.reportFile) {
				await collector.forceWrite();
			}
			clearGlobalCollector();

			return {
				success: true,
				deploymentId: deployment.id,
				projectId: project.projectId,
				logs,
				urls: complete?.publicUrls
					? {
							deployment: complete.publicUrls.deployment,
							latest: complete.publicUrls.latest,
							custom: complete.publicUrls.custom,
							dashboard,
						}
					: undefined,
			};
		} catch (ex) {
			collector.addGeneralError('deploy', String(ex), 'DEPLOY004');
			if (opts.reportFile) {
				await collector.forceWrite();
			}
			clearGlobalCollector();
			tui.fatal(`unexpected error trying to deploy project. ${ex}`);
		}
	},
});
