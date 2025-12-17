import { z } from 'zod';
import { join, resolve } from 'node:path';
import { createPublicKey } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { StructuredError } from '@agentuity/core';
import { createSubcommand } from '../../types';
import * as tui from '../../tui';
import { saveProjectDir, getDefaultConfigDir } from '../../config';
import {
	runSteps,
	stepSuccess,
	stepSkipped,
	stepError,
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
	findEnvFile,
	readEnvFile,
	filterAgentuitySdkKeys,
	splitEnvAndSecrets,
} from '../../env-util';
import { zipDir } from '../../utils/zip';
import { encryptFIPSKEMDEMStream } from '../../crypto/box';
import { getCommand } from '../../command-prefix';
import { checkCustomDomainForDNS } from './domain';
import { DeployOptionsSchema } from '../../schemas/deploy';
import { ErrorCode } from '../../errors';

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
		{
			command: getCommand('cloud deploy --tag a --tag b'),
			description: 'Deploy with specific tags',
		},
	],
	toplevel: true,
	idempotent: false,
	requires: { auth: true, project: true, apiClient: true },
	prerequisites: ['auth login'],
	schema: {
		options: DeployOptionsSchema,
		response: DeployResponseSchema,
	},

	async handler(ctx) {
		const { project, apiClient, projectDir, config, options, logger } = ctx;

		let deployment: Deployment | undefined;
		let build: BuildMetadata | undefined;
		let instructions: DeploymentInstructions | undefined;
		let complete: DeploymentComplete | undefined;
		let statusResult: DeploymentStatusResult | undefined;
		const logs: string[] = [];

		try {
			await saveProjectDir(projectDir);

			await runSteps(
				[
					!project.deployment?.domains?.length
						? null
						: {
								label: `Validate Custom Domain${project.deployment.domains.length > 1 ? `s: ${project.deployment.domains.join(', ')}` : `: ${project.deployment.domains[0]}`}`,
								run: async () => {
									if (project.deployment?.domains?.length) {
										const result = await checkCustomDomainForDNS(
											project.projectId,
											project.deployment.domains,
											config
										);
										for (const r of result) {
											if (r.success) {
												continue;
											}
											if (r.message) {
												return stepError(r.message);
											}
											return stepError('unknown dns error'); // shouldn't get here
										}
										return stepSuccess();
									}
									return stepSkipped();
								},
							},
					{
						label: 'Sync Env & Secrets',
						run: async () => {
							try {
								// Read local env file (.env.production or .env)
								const envFilePath = await findEnvFile(projectDir);
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
							try {
								const bundleResult = await viteBundle({
									rootDir: resolve(projectDir),
									dev: false,
									deploymentId: deployment.id,
									orgId: deployment.orgId,
									projectId: project.projectId,
									logger: ctx.logger,
								});
								capturedOutput = bundleResult.output;
								build = await loadBuildMetadata(join(projectDir, '.agentuity'));
								instructions = await projectDeploymentUpdate(
									apiClient,
									deployment.id,
									build
								);
								return stepSuccess(capturedOutput.length > 0 ? capturedOutput : undefined);
							} catch (ex) {
								const _ex = ex as Error;
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

							progress(5);
							ctx.logger.trace('Starting deployment zip creation');
							// zip up the assets folder
							const deploymentZip = join(tmpdir(), `${deployment.id}.zip`);
							await zipDir(join(projectDir, '.agentuity'), deploymentZip, {
								filter: (_filename: string, relative: string) => {
									// Exclude Vite-specific build artifacts
									if (relative.endsWith('.generated.ts')) {
										return false;
									}
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

							progress(20);
							// Encrypt the deployment zip using the public key from deployment
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

								progress(50);
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
									return stepError(`Error uploading deployment: ${await resp.text()}`);
								}

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
							if (build?.assets) {
								ctx.logger.trace(`Uploading ${build.assets.length} assets`);
								if (!instructions.assets) {
									return stepError(
										'server did not provide asset upload URLs; upload aborted'
									);
								}

								const promises: Promise<Response>[] = [];
								for (const asset of build.assets) {
									const assetUrl = instructions.assets[asset.filename];
									if (!assetUrl) {
										return stepError(
											`server did not provide upload URL for asset "${asset.filename}"; upload aborted`
										);
									}

									// Asset filename already includes the subdirectory (e.g., "client/assets/main-abc123.js")
									const file = Bun.file(join(projectDir, '.agentuity', asset.filename));
									promises.push(
										fetch(assetUrl, {
											method: 'PUT',
											duplex: 'half',
											headers: {
												'Content-Type': asset.contentType,
											},
											body: file,
										})
									);
								}
								ctx.logger.trace('Waiting for asset uploads');
								const resps = await Promise.all(promises);
								for (const r of resps) {
									if (!r.ok) {
										return stepError(`error uploading asset: ${await r.text()}`);
									}
								}
								ctx.logger.trace('Asset uploads complete');
								progress(95);
							}

							progress(100);
							return stepSuccess();
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

			const streamId = complete?.streamId;

			// Poll for deployment status with optional log streaming
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
							tui.success('Your project was deployed!');
						})
						.catch((ex) => {
							// Handle cancellation
							if (ex instanceof DeploymentCancelledError) {
								tui.warning('Deployment cancelled');
								process.exit(130); // Standard exit code for SIGINT
							}
							const exwithmessage = ex as { message: string };
							const msg =
								exwithmessage.message === 'Deployment failed'
									? ''
									: exwithmessage.toString();
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

					tui.success('Your project was deployed!');
				}
			} finally {
				// Clean up signal handler
				process.off('SIGINT', sigintHandler);
			}

			const appUrl = getAppBaseURL(config?.name, config?.overrides);

			const dashboard = `${appUrl}/r/${deployment.id}`;

			// Show deployment URLs
			if (complete?.publicUrls) {
				if (complete.publicUrls.custom?.length) {
					for (const url of complete.publicUrls.custom) {
						tui.arrow(tui.bold(tui.padRight('Deployment URL:', 17)) + tui.link(url));
					}
				} else {
					tui.arrow(
						tui.bold(tui.padRight('Deployment URL:', 17)) +
							tui.link(complete.publicUrls.deployment)
					);
					tui.arrow(
						tui.bold(tui.padRight('Project URL:', 17)) + tui.link(complete.publicUrls.latest)
					);
					tui.arrow(tui.bold(tui.padRight('Dashboard URL:', 17)) + tui.link(dashboard));
				}
			}

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
			tui.fatal(`unexpected error trying to deploy project. ${ex}`);
		}
	},
});
