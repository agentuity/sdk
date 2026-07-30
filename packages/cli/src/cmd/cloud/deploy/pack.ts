/**
 * Offline / pack-only deploy mode
 * -------------------------------
 *
 * Builds the project the same way a real deploy would, zips the staging
 * tree with the production deploy filter, then optionally writes the zip
 * to disk and/or PUTs it to a caller-provided URL (e.g. a presigned S3
 * URL). No cloud deployment is created, no encryption, no Agentuity API
 * calls, and no agentuity.json / login / DNS requirements.
 *
 *   agentuity deploy --pack-only --log-level=trace
 *   agentuity deploy --upload-url 'https://bucket.s3.../presigned'
 *   agentuity deploy --pack-only --upload-url '...' --pack-output ./out.zip
 */

import { createReadStream, mkdirSync, statSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { Readable } from 'node:stream';
import type { ReadableStream as NodeWebReadableStream } from 'node:stream/web';
import type { Logger } from '@agentuity/core';
import { clearGlobalCollector, type BuildReportCollector } from '../../../build-report.ts';
import * as tui from '../../../tui.ts';
import type { DeployOptions, Project } from '../../../types.ts';
import { PACK_ONLY_DEPLOYMENT_ID } from '../../build/adapters/cdn-origin.ts';
import { runBuildPipeline } from '../../build/run.ts';
import { DEPLOY_PACK_ZIP_BASENAME, packageDeploymentZip } from './package.ts';

/** Stub project fields used when offline deploy has no agentuity.json. */
export const OFFLINE_DEPLOY_PROJECT_ID = 'offline';
export const OFFLINE_DEPLOY_ORG_ID = 'offline';
export const OFFLINE_DEPLOY_REGION = 'local';

export interface PackOnlyParams {
	/** Optional — offline mode does not require a registered project. */
	project?: Project | null;
	projectDir: string;
	logger: Logger;
	collector: BuildReportCollector;
	deployOptions: DeployOptions;
	hasReportFile: boolean;
	packOutput?: string;
	/** When set, PUT the plain deployment zip to this URL after packaging. */
	uploadUrl?: string;
	json?: boolean;
}

export interface PackOnlyResult {
	success: true;
	projectId: string;
	/** No cloud deployment is created in pack-only / offline mode. */
	deploymentId?: undefined;
	/** Present when a local zip was retained (pack-only and/or --pack-output). */
	packPath?: string;
	fileCount: number;
	skippedCount: number;
	sizeBytes: number;
	stagingDir: string;
	/** True when monorepo staging applied `.agentuityignore` patterns. */
	usedIgnorePatterns: boolean;
	/** True when the zip was uploaded to `--upload-url`. */
	uploaded?: boolean;
	logs: string[];
}

/**
 * Resolve where the pack-only zip should land.
 * Default: `<projectDir>/agentuity-deploy.zip`.
 */
export function resolvePackOutputPath(projectDir: string, packOutput?: string): string {
	if (packOutput) {
		return isAbsolute(packOutput) ? packOutput : resolve(projectDir, packOutput);
	}
	return join(projectDir, DEPLOY_PACK_ZIP_BASENAME);
}

/**
 * Resolve pack-only zip path, refusing to write inside the staging tree
 * (which would race the zip scan). Exported for unit tests.
 */
export function resolveSafePackOutput(
	stagingDir: string,
	requested: string,
	logger: Logger,
	json?: boolean
): string {
	const stagingResolved = resolve(stagingDir);
	const outputResolved = resolve(requested);
	if (
		outputResolved === stagingResolved ||
		outputResolved.startsWith(`${stagingResolved}/`) ||
		outputResolved.startsWith(`${stagingResolved}\\`)
	) {
		const fallback = join(dirname(stagingResolved), DEPLOY_PACK_ZIP_BASENAME);
		logger.debug('Pack output path is inside staging dir; writing to %s instead', fallback);
		if (!json) {
			tui.warning(
				`Pack output was inside the staging directory; writing to ${fallback} instead`
			);
		}
		return fallback;
	}
	return outputResolved;
}

/**
 * PUT a local zip to a presigned/one-time URL (plain zip, no encryption).
 * Exported for unit tests.
 */
export async function uploadDeploymentZip(params: {
	zipPath: string;
	uploadUrl: string;
	logger: Pick<Logger, 'debug' | 'trace'>;
	signal?: AbortSignal;
}): Promise<void> {
	const { zipPath, uploadUrl, logger, signal } = params;
	const fileSize = statSync(zipPath).size;
	logger.debug('Uploading deployment zip (%d bytes) to provided URL', fileSize);
	logger.trace(
		'Upload URL host: %s',
		(() => {
			try {
				return new URL(uploadUrl).host;
			} catch {
				return '(invalid url)';
			}
		})()
	);

	const body = Readable.toWeb(
		createReadStream(zipPath)
	) as unknown as NodeWebReadableStream<Uint8Array> as ReadableStream<Uint8Array>;

	const resp = await fetch(uploadUrl, {
		method: 'PUT',
		headers: {
			'Content-Type': 'application/zip',
			'Content-Length': String(fileSize),
		},
		body,
		signal,
		duplex: 'half',
	} as RequestInit & { duplex: 'half' });

	logger.trace('Upload response status: %d', resp.status);
	if (!resp.ok) {
		const text = await resp.text().catch(() => '');
		throw new Error(
			`Upload to --upload-url failed: HTTP ${resp.status}${text ? ` — ${text.slice(0, 500)}` : ''}`
		);
	}
	// No response body needed; cancel to free the connection promptly.
	await resp.body?.cancel().catch(() => undefined);
}

/**
 * Build + package without Agentuity cloud. Optionally writes a local zip
 * and/or PUTs it to `--upload-url`. Flushes the build report collector
 * when `--report-file` is set (success or failure).
 */
export async function runPackOnly(params: PackOnlyParams): Promise<PackOnlyResult> {
	const {
		project,
		projectDir,
		logger,
		collector,
		deployOptions,
		hasReportFile,
		packOutput,
		uploadUrl,
		json,
	} = params;

	const rootDir = resolve(projectDir);
	const projectId = project?.projectId ?? OFFLINE_DEPLOY_PROJECT_ID;
	const orgId = project?.orgId ?? OFFLINE_DEPLOY_ORG_ID;
	const region = project?.region ?? OFFLINE_DEPLOY_REGION;

	// Retain a local zip when the user asked for --pack-only, or passed an
	// explicit --pack-output. With only --upload-url, use a temp file and
	// delete it after a successful upload.
	const retainLocalZip = Boolean(deployOptions.packOnly) || Boolean(packOutput);
	const useTempZip = Boolean(uploadUrl) && !retainLocalZip;

	const requestedOutput = useTempZip
		? join(tmpdir(), `agentuity-offline-${Date.now()}-${DEPLOY_PACK_ZIP_BASENAME}`)
		: resolvePackOutputPath(rootDir, packOutput);

	const modeLabel = uploadUrl
		? retainLocalZip
			? 'Offline pack + upload'
			: 'Offline upload'
		: 'Pack-only';

	logger.debug('%s mode: building and packaging without Agentuity cloud', modeLabel);
	if (!json) {
		tui.info(
			uploadUrl
				? `${modeLabel} — building, packaging, and uploading (no login / agentuity.json required)`
				: 'Pack-only mode — building and packaging without uploading (no login / agentuity.json required)'
		);
	}

	let zipPathForCleanup: string | undefined;

	try {
		const pipelineResult = await runBuildPipeline({
			projectDir: rootDir,
			logger,
			collector,
			projectId,
			orgId,
			region,
			deploymentId: PACK_ONLY_DEPLOYMENT_ID,
			deploymentOptions: deployOptions,
			deploymentConfig: project?.deployment as Record<string, unknown> | undefined,
			skipTypeCheck: deployOptions.skipTypeCheck,
		});

		const { framework, monorepo, buildResult, outputDir } = pipelineResult;
		const logs = [...pipelineResult.logs];
		// Structured flag from monorepo staging; monorepo fallback keeps the
		// staging-vs-zip tip useful even when no ignore file was present.
		const usedIgnorePatterns = Boolean(
			pipelineResult.usedIgnorePatterns ?? buildResult.usedIgnorePatterns
		);

		const frameworkLabel = framework.version
			? `${framework.name} v${framework.version}`
			: framework.name;
		if (!json) {
			tui.success(`Detected ${tui.bold(frameworkLabel)} (${framework.runtime})`);
			if (monorepo) {
				tui.info(
					`Workspace ${tui.muted(monorepo.root)} (subpackage: ${tui.bold(monorepo.subpath)})`
				);
			}
			for (const line of buildResult.logs) {
				tui.info(tui.muted(line));
			}
		}

		const stagingDir = buildResult.outputDir ?? outputDir;
		const finalOutput = resolveSafePackOutput(stagingDir, requestedOutput, logger, json);
		mkdirSync(dirname(finalOutput), { recursive: true });

		const zipResult = await packageDeploymentZip({
			sourceDir: stagingDir,
			outputPath: finalOutput,
			logger,
		});

		if (useTempZip) {
			zipPathForCleanup = zipResult.outputPath;
		}

		const relPack = relative(rootDir, zipResult.outputPath) || zipResult.outputPath;
		if (!json) {
			tui.success(
				`Packaged ${zipResult.added} file(s) (${tui.formatBytes(zipResult.sizeBytes)})${
					retainLocalZip || !uploadUrl ? ` → ${tui.bold(relPack)}` : ''
				}`
			);
			if (zipResult.skipped > 0) {
				tui.info(
					tui.muted(
						`${zipResult.skipped} staging path(s) not packed (zip filter / symlink / directory)`
					)
				);
			}
			if (usedIgnorePatterns || monorepo) {
				tui.info(
					tui.muted(
						'Ignore exclusions happen during monorepo staging (see "Excluded … via .agentuityignore" above), not in the zip step.'
					)
				);
			}
			if (retainLocalZip || !uploadUrl) {
				tui.info(
					tui.muted(
						`Inspect with: unzip -l ${relPack}  ·  re-run with --log-level=trace to list every staged entry`
					)
				);
			}
		}

		logs.push(
			`Packaged ${zipResult.added} file(s) from staging (${zipResult.skipped} not packed at zip step), ${zipResult.sizeBytes} bytes → ${zipResult.outputPath}`
		);

		let uploaded = false;
		if (uploadUrl) {
			if (!json) {
				tui.info('Uploading deployment zip to provided URL...');
			}
			await uploadDeploymentZip({
				zipPath: zipResult.outputPath,
				uploadUrl,
				logger,
			});
			uploaded = true;
			logs.push(`Uploaded ${zipResult.sizeBytes} bytes to --upload-url`);
			if (!json) {
				tui.success(
					`Uploaded ${tui.formatBytes(zipResult.sizeBytes)} to the provided upload URL`
				);
			}
		}

		return {
			success: true,
			projectId,
			packPath: retainLocalZip || !uploadUrl ? zipResult.outputPath : undefined,
			fileCount: zipResult.added,
			skippedCount: zipResult.skipped,
			sizeBytes: zipResult.sizeBytes,
			stagingDir,
			usedIgnorePatterns: usedIgnorePatterns || Boolean(monorepo),
			uploaded: uploaded || undefined,
			logs,
		};
	} finally {
		if (zipPathForCleanup) {
			await rm(zipPathForCleanup, { force: true }).catch(() => undefined);
		}
		if (hasReportFile) {
			await collector.forceWrite();
			clearGlobalCollector();
		}
	}
}
