import { join, resolve } from 'node:path';
import { createPublicKey } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { tmpdir } from 'node:os';
import { createSubcommand } from '../../types';
import * as tui from '../../tui';
import { saveProjectDir } from '../../config';
import { runSteps, stepSuccess, stepSkipped, stepError, Step } from '../../steps';
import { bundle } from '../bundle/bundler';
import { loadBuildMetadata } from '../../config';
import {
	projectEnvUpdate,
	projectDeploymentCreate,
	projectDeploymentUpdate,
	projectDeploymentComplete,
	type Deployment,
	type BuildMetadata,
	type DeploymentInstructions,
	type DeploymentComplete,
} from '@agentuity/server';
import {
	findEnvFile,
	readEnvFile,
	filterAgentuitySdkKeys,
	splitEnvAndSecrets,
} from '../../env-util';
import { zipDir } from '../../utils/zip';
import { encryptFIPSKEMDEMStream } from '../../crypto/box';
import { checkCustomDomainForDNS } from './domain';

export const deploySubcommand = createSubcommand({
	name: 'deploy',
	description: 'Deploy project to the Agentuity Cloud',
	toplevel: true,
	requires: { auth: true, project: true, apiClient: true },

	async handler(ctx) {
		const { project, apiClient, projectDir, config } = ctx;

		let deployment: Deployment | undefined;
		let build: BuildMetadata | undefined;
		let instructions: DeploymentInstructions | undefined;
		let complete: DeploymentComplete | undefined;

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
								deployment = await projectDeploymentCreate(apiClient, project.projectId);
								return stepSuccess();
							} catch (ex) {
								return stepError(ex instanceof Error ? ex.message : String(ex));
							}
						},
					},
					{
						label: 'Build, Verify and Package',
						run: async () => {
							if (!deployment) {
								return stepError('deployment was null');
							}
							try {
								await bundle({
									rootDir: resolve(projectDir),
									dev: false,
									deploymentId: deployment.id,
									orgId: deployment.orgId,
									projectId: project.projectId,
									project,
								});
								build = await loadBuildMetadata(join(projectDir, '.agentuity'));
								instructions = await projectDeploymentUpdate(
									apiClient,
									deployment.id,
									build
								);
								return stepSuccess();
							} catch (ex) {
								const _ex = ex as Error;
								return stepError(_ex.message ?? 'Error building your project');
							}
						},
					},
					{
						label: 'Encrypt and Upload Deployment',
						run: async () => {
							if (!deployment) {
								return stepError('deployment was null');
							}
							if (!instructions) {
								return stepError('deployment instructions were null');
							}

							// zip up the assets folder
							const deploymentZip = join(tmpdir(), `${deployment.id}.zip`);
							await zipDir(join(projectDir, '.agentuity'), deploymentZip, {
								filter: (_filename: string, relative: string) => {
									// we don't include assets in the deployment
									if (relative.startsWith('web/assets/')) {
										return false;
									}
									if (relative.startsWith('web/chunk/')) {
										return false;
									}
									if (relative.startsWith('web/public/')) {
										return false;
									}
									return true;
								},
							});

							// Encrypt the deployment zip using the public key from deployment
							const encryptedZip = join(tmpdir(), `${deployment.id}.enc.zip`);
							try {
								const publicKey = createPublicKey({
									key: deployment.publicKey,
									format: 'pem',
									type: 'spki',
								});

								const src = createReadStream(deploymentZip);
								const dst = createWriteStream(encryptedZip);

								await encryptFIPSKEMDEMStream(publicKey, src, dst);

								// Close and wait for stream to finish writing
								dst.end();
								await new Promise<void>((resolve) => {
									if (dst.writableFinished) {
										resolve();
									} else {
										dst.once('finish', resolve);
									}
								});

								const zipfile = Bun.file(encryptedZip);
								const resp = await fetch(instructions.deployment, {
									method: 'PUT',
									duplex: 'half',
									headers: {
										'Content-Type': 'application/zip',
									},
									body: zipfile,
								});
								if (!resp.ok) {
									return stepError(`Error uploading deployment: ${await resp.text()}`);
								}

								// Wait for response body to be consumed before deleting
								await resp.arrayBuffer();
								await zipfile.delete();
							} finally {
								// Cleanup in case of error
								if (await Bun.file(encryptedZip).exists()) {
									await Bun.file(encryptedZip).delete();
								}
								await Bun.file(deploymentZip).delete();
							}

							if (build?.assets) {
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

									const file = Bun.file(
										join(projectDir, '.agentuity', 'web', asset.filename)
									);
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
								const resps = await Promise.all(promises);
								for (const r of resps) {
									if (!r.ok) {
										return stepError(`error uploading asset: ${await r.text()}`);
									}
								}
							}

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
				].filter(Boolean) as Step[]
			);
			tui.success('Your project was deployed!');

			if (complete?.publicUrls && deployment) {
				tui.arrow(tui.bold(tui.padRight('Deployment ID:', 17)) + tui.link(deployment.id));
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
				}
			}
		} catch (ex) {
			tui.fatal(`unexpected error trying to deploy project. ${ex}`);
		}
	},
});
