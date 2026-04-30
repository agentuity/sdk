/**
 * Upload phase
 * ------------
 *
 * Takes the build artifacts produced by the Build phase, encrypts the
 * code zip with the deployment's public key, and uploads everything
 * (encrypted zip + static assets) to the URLs the server handed back in
 * the build phase's `DeploymentInstructions`.
 *
 * Two `Step` factories are exposed so the deploy command's `runSteps()`
 * pipeline keeps its existing visual progression:
 *   - `buildEncryptUploadStep`  — zips, encrypts, uploads code + assets.
 *   - `buildProvisionStep`      — calls `projectDeploymentComplete` and
 *                                 stashes the result on pipelineState so
 *                                 the wait phase can read the stream id.
 *
 * Failure modes flush the build report (when `--report-file` is set) so
 * CI always gets the diagnostics on disk before we abort.
 */

import { createPublicKey } from 'node:crypto';
import { createReadStream, createWriteStream, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import {
	type Deployment,
	type DeploymentComplete,
	projectDeploymentComplete,
} from '@agentuity/server';
import type { APIClient } from '../../../api';
import type { BuildReportCollector } from '../../../build-report';
import { encryptFIPSKEMDEMStream } from '../../../crypto/box';
import {
	type Step,
	type StepContext,
	type StepOutcome,
	stepError,
	stepSuccess,
} from '../../../steps';
import * as tui from '../../../tui';
import type { DeployPipelineState } from './types';

export interface UploadStepParams {
	projectDir: string;
	collector: BuildReportCollector;
	deployment: Deployment | undefined;
	hasReportFile: boolean;
	state: DeployPipelineState;
	/** Logger to thread through. */
	logger: { trace: (msg: string) => void; debug: (msg: string) => void };
}

/**
 * Render the final "Uploaded N assets ..." line after a successful CDN
 * upload pass. Reports both the original and on-the-wire totals when gzip
 * compressed at least one file, so the user can see the real transfer cost.
 *
 * Exported so the deploy command can reuse the same formatting if needed.
 */
export function formatUploadSummary(
	count: number,
	rawBytes: number,
	transferredBytes: number
): string {
	const noun = tui.plural(count, 'asset', 'assets');
	// When no compression happened (icons, fonts, binaries), rawBytes ===
	// transferredBytes and the extra detail would just be noise.
	if (transferredBytes === rawBytes) {
		return `✓ Uploaded ${count} ${noun} (${tui.formatBytes(rawBytes)}) to CDN`;
	}
	return `✓ Uploaded ${count} ${noun} (${tui.formatBytes(transferredBytes)} on wire, ${tui.formatBytes(rawBytes)} raw) to CDN`;
}

/**
 * Build the "Encrypt and Upload Deployment" step.
 *
 * Reads the Build phase's outputs (`build`, `buildOutputDir`,
 * `instructions`) from `state`, zips the build output dir, encrypts it
 * with the deployment public key, uploads the encrypted zip to the
 * server-provided URL, then fans out parallel uploads of every static
 * asset (gzipping compressible types on the fly).
 */
export function buildEncryptUploadStep(params: UploadStepParams): Step {
	const { projectDir, collector, deployment, hasReportFile, state, logger } = params;

	return {
		label: 'Encrypt and Upload Deployment',
		run: async (stepCtx: StepContext): Promise<StepOutcome> => {
			const progress = stepCtx.progress;
			if (!deployment) {
				return stepError('deployment was null');
			}
			const { build, buildOutputDir, instructions } = state;
			if (!instructions) {
				return stepError('deployment instructions were null');
			}

			// Phase A — zip the build output directory. This is the input to
			// the encryption step; we never PUT the plain zip to the server.
			const endZipDiagnostic = collector.startDiagnostic('zip-package');
			progress(5);
			logger.trace('Starting deployment zip creation');

			// `buildOutputDir` is set by the build phase; fall back to the
			// legacy `.agentuity/` for adapters that don't override it.
			const zipSourceDir = buildOutputDir ?? join(projectDir, '.agentuity');
			const deploymentZip = join(tmpdir(), `${deployment.id}.zip`);

			// Lazy-load `zipDir` to avoid hauling archiver into the deploy
			// command's import graph for non-deploy paths.
			const { zipDir } = await import('../../../utils/zip');
			await zipDir(zipSourceDir, deploymentZip, {
				filter: (_filename: string, relative: string) => {
					if (relative.startsWith('.vite/')) {
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
			logger.trace(`Deployment zip created: ${deploymentZip}`);
			endZipDiagnostic();

			// Phase B — encrypt the zip with the deployment's public key
			// (FIPS KEM/DEM stream). The encrypted output goes to a sibling
			// temp file so we can stream it to S3 with a known Content-Length.
			progress(20);
			const endEncryptDiagnostic = collector.startDiagnostic('encrypt');
			const encryptedZip = join(tmpdir(), `${deployment.id}.enc.zip`);
			try {
				logger.trace('Creating public key');
				const publicKey = createPublicKey({
					key: deployment.publicKey,
					format: 'pem',
					type: 'spki',
				});

				logger.trace('Creating read/write streams');
				const src = createReadStream(deploymentZip);
				const dst = createWriteStream(encryptedZip);

				logger.trace('Starting encryption');
				await encryptFIPSKEMDEMStream(publicKey, src, dst);
				logger.trace('Encryption complete');

				progress(40);
				logger.trace('Waiting for stream to finish');
				await new Promise<void>((resolve, reject) => {
					dst.once('finish', resolve);
					dst.once('error', reject);
					dst.end();
				});
				logger.trace('Stream finished');
				endEncryptDiagnostic();

				// Phase C — upload the encrypted code zip. Returns a 200 on
				// success; bodies are not used so we cancel the response to
				// release the buffer immediately.
				progress(50);
				const endCodeUploadDiagnostic = collector.startDiagnostic('code-upload');
				logger.trace(`Uploading deployment to ${instructions.deployment}`);
				const zipfile = Bun.file(encryptedZip);
				const fileSize = zipfile.size;
				logger.trace(`Upload file size: ${fileSize} bytes`);
				const resp = await fetch(instructions.deployment, {
					method: 'PUT',
					headers: {
						'Content-Type': 'application/zip',
						'Content-Length': String(fileSize),
					},
					body: zipfile,
					signal: stepCtx.signal,
				});
				logger.trace(`Upload response: ${resp.status}`);
				if (!resp.ok) {
					endCodeUploadDiagnostic();
					const errorMsg = `Error uploading deployment: ${await resp.text()}`;
					collector.addGeneralError('deploy', errorMsg, 'DEPLOY002');
					if (hasReportFile) {
						await collector.forceWrite();
					}
					return stepError(errorMsg);
				}
				endCodeUploadDiagnostic();

				progress(70);
				logger.trace('Cancelling upload response body');
				// No response payload is needed for successful uploads.
				// Cancel to release resources without buffering into memory.
				await resp.body?.cancel();
				logger.trace('Deleting encrypted zip');
				await zipfile.delete();
			} finally {
				logger.trace('Cleanup');
				if (await Bun.file(encryptedZip).exists()) {
					await Bun.file(encryptedZip).delete();
				}
				await Bun.file(deploymentZip).delete();
			}

			// Phase D — upload static assets in parallel. We track the raw
			// on-disk size and the actual on-the-wire bytes (post-gzip) so
			// the summary can show real CDN cost for compressible payloads.
			progress(80);
			let rawBytes = 0;
			let transferredBytes = 0;
			if (build?.assets && build.assets.length > 0) {
				const endCdnUploadDiagnostic = collector.startDiagnostic('cdn-upload');
				logger.trace(`Uploading ${build.assets.length} assets`);
				if (!instructions.assets) {
					const errorMsg = 'server did not provide asset upload URLs; upload aborted';
					collector.addGeneralError('deploy', errorMsg, 'DEPLOY006');
					if (hasReportFile) {
						await collector.forceWrite();
					}
					return stepError(errorMsg);
				}

				// Pre-flight: every asset the build emitted must have a signed
				// PUT URL from the backend. Failing up-front gives a single
				// clear error instead of aborting mid-batch with partial
				// uploads.
				for (const asset of build.assets) {
					if (!instructions.assets[asset.filename]) {
						const errorMsg = `server did not provide upload URL for asset "${asset.filename}"; upload aborted`;
						collector.addGeneralError('deploy', errorMsg, 'DEPLOY006');
						if (hasReportFile) {
							await collector.forceWrite();
						}
						return stepError(errorMsg);
					}
					rawBytes += asset.size;
				}

				// Track every temp gzip file we create so we can clean them
				// up even if the deploy is aborted mid-upload (e.g. Ctrl+C).
				const tempFiles = new Set<string>();
				const cleanupTempFiles = () => {
					for (const p of tempFiles) {
						try {
							unlinkSync(p);
						} catch {
							// ignore — may already be gone
						}
					}
					tempFiles.clear();
				};

				// Hoist narrowed locals for use inside the async upload
				// closure; TS doesn't propagate narrowings of `build` /
				// `instructions` across async callbacks, and we've already
				// null-checked both above.
				const assets = build.assets;
				const assetUrls = instructions.assets;
				// v3 buildpack pipeline emits assets into `buildOutputDir`;
				// fall back to `.agentuity/` for the legacy path.
				const assetBaseDir = buildOutputDir ?? join(projectDir, '.agentuity');

				try {
					const uploadOne = async (asset: (typeof assets)[number]): Promise<void> => {
						const assetUrl = assetUrls[asset.filename]!;
						// Asset filename already includes the subdirectory
						// (e.g., "client/assets/main-abc123.js").
						const filePath = join(assetBaseDir, asset.filename);

						const headers: Record<string, string> = {
							'Content-Type': asset.contentType,
						};

						let body: Blob;
						let gzTempPath: string | undefined;
						let onWireSize = asset.size;

						if (asset.contentEncoding === 'gzip') {
							// Gzip to a temp file so Bun.file() can provide
							// Content-Length to S3 (streaming bodies use
							// chunked transfer encoding which S3 rejects).
							gzTempPath = join(
								tmpdir(),
								`agentuity-asset-${deployment.id}-${Date.now()}-${asset.filename.replace(/\//g, '_')}.gz`
							);
							tempFiles.add(gzTempPath);
							await pipeline(
								createReadStream(filePath),
								createGzip(),
								createWriteStream(gzTempPath)
							);
							headers['Content-Encoding'] = 'gzip';
							body = Bun.file(gzTempPath);
							onWireSize = body.size;
							logger.trace(
								`Gzip compressed ${asset.filename} (${asset.size} -> ${onWireSize} bytes)`
							);
						} else {
							body = Bun.file(filePath);
						}

						const response = await fetch(assetUrl, {
							method: 'PUT',
							headers,
							body,
							signal: stepCtx.signal,
						});

						if (gzTempPath) {
							try {
								unlinkSync(gzTempPath);
							} catch {
								// ignore
							}
							tempFiles.delete(gzTempPath);
						}

						if (!response.ok) {
							throw new Error(
								`asset "${asset.filename}" upload failed: ${response.status} ${await response.text()}`
							);
						}

						transferredBytes += onWireSize;
					};

					// Upload each asset with bounded concurrency. gzip
					// compression runs inside the per-asset task, so
					// compressible files compress in parallel (up to
					// `concurrency`) rather than serially — a meaningful win
					// for builds with many JS/CSS chunks since gzip is
					// single-threaded per call.
					const concurrency = Math.min(4, assets.length);
					for (let i = 0; i < assets.length; i += concurrency) {
						const batch = assets.slice(i, i + concurrency);
						await Promise.all(batch.map(uploadOne));
					}
				} catch (error) {
					cleanupTempFiles();
					const errorMsg = error instanceof Error ? error.message : String(error);
					collector.addGeneralError('deploy', errorMsg, 'DEPLOY006');
					if (hasReportFile) {
						await collector.forceWrite();
					}
					return stepError(errorMsg);
				}

				logger.trace(
					`Asset uploads complete: ${build.assets.length} files, raw=${rawBytes}B, on-wire=${transferredBytes}B`
				);
				endCdnUploadDiagnostic();
				progress(95);
			} else {
				logger.debug('No assets to upload to CDN');
			}

			progress(100);
			const output = build?.assets.length
				? [tui.muted(formatUploadSummary(build.assets.length, rawBytes, transferredBytes))]
				: undefined;
			return stepSuccess(output);
		},
	};
}

export interface ProvisionStepParams {
	apiClient: APIClient;
	deployment: Deployment | undefined;
	/** Mutable: written to once `projectDeploymentComplete` returns. */
	completeRef: { current?: DeploymentComplete };
}

/**
 * Build the "Provision Deployment" step.
 *
 * Tells the server we're done uploading; the server then schedules the
 * deployment for warmup and returns the stream id we'll use to tail
 * build/run logs in the wait phase.
 *
 * The result is stashed via a small `completeRef` ref-cell instead of
 * being returned, so the surrounding handler still has access to it
 * after `runSteps()` returns. We use a ref-cell rather than the shared
 * `DeployPipelineState` because `complete` is consumed by the wait phase
 * which lives outside the step pipeline today.
 */
export function buildProvisionStep(params: ProvisionStepParams): Step {
	const { apiClient, deployment, completeRef } = params;

	return {
		label: 'Provision Deployment',
		run: async (stepCtx: StepContext): Promise<StepOutcome> => {
			if (!deployment) {
				return stepError('deployment was null');
			}
			completeRef.current = await projectDeploymentComplete(
				apiClient,
				deployment.id,
				stepCtx.signal
			);
			return stepSuccess();
		},
	};
}
