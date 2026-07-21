/**
 * Pack-only deploy mode
 * ---------------------
 *
 * Builds the project the same way a real deploy would, zips the staging
 * tree with the production deploy filter, and writes the plain zip to
 * disk — without creating a cloud deployment, encrypting, or uploading.
 *
 *   agentuity deploy --pack-only --log-level=trace
 */

import { mkdirSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import type { Logger } from '@agentuity/core';
import { clearGlobalCollector, type BuildReportCollector } from '../../../build-report.ts';
import * as tui from '../../../tui.ts';
import type { DeployOptions, Project } from '../../../types.ts';
import { runBuildPipeline } from '../../build/run.ts';
import { DEPLOY_PACK_ZIP_BASENAME, packageDeploymentZip } from './package.ts';

export interface PackOnlyParams {
	project: Project;
	projectDir: string;
	logger: Logger;
	collector: BuildReportCollector;
	deployOptions: DeployOptions;
	hasReportFile: boolean;
	packOutput?: string;
	json?: boolean;
}

export interface PackOnlyResult {
	success: true;
	projectId: string;
	/** No cloud deployment is created in pack-only mode. */
	deploymentId?: undefined;
	packPath: string;
	fileCount: number;
	skippedCount: number;
	sizeBytes: number;
	stagingDir: string;
	/** True when monorepo staging applied `.agentuityignore` patterns. */
	usedIgnorePatterns: boolean;
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
 * Build + package without uploading. Flushes the build report collector
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
		json,
	} = params;

	const rootDir = resolve(projectDir);
	const requestedOutput = resolvePackOutputPath(rootDir, packOutput);

	logger.debug('Pack-only mode: building and packaging without upload');
	if (!json) {
		tui.info('Pack-only mode — building and packaging without uploading');
	}

	try {
		const pipelineResult = await runBuildPipeline({
			projectDir: rootDir,
			logger,
			collector,
			projectId: project.projectId,
			orgId: project.orgId,
			region: project.region,
			deploymentId: 'pack-only',
			deploymentOptions: deployOptions,
			deploymentConfig: project.deployment,
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

		const relPack = relative(rootDir, zipResult.outputPath) || zipResult.outputPath;
		if (!json) {
			tui.success(
				`Packaged ${zipResult.added} file(s) (${tui.formatBytes(zipResult.sizeBytes)}) → ${tui.bold(relPack)}`
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
			tui.info(
				tui.muted(
					`Inspect with: unzip -l ${relPack}  ·  re-run with --log-level=trace to list every staged entry`
				)
			);
		}

		logs.push(
			`Packaged ${zipResult.added} file(s) from staging (${zipResult.skipped} not packed at zip step), ${zipResult.sizeBytes} bytes → ${zipResult.outputPath}`
		);

		return {
			success: true,
			projectId: project.projectId,
			packPath: zipResult.outputPath,
			fileCount: zipResult.added,
			skippedCount: zipResult.skipped,
			sizeBytes: zipResult.sizeBytes,
			stagingDir,
			usedIgnorePatterns: usedIgnorePatterns || Boolean(monorepo),
			logs,
		};
	} finally {
		if (hasReportFile) {
			await collector.forceWrite();
			clearGlobalCollector();
		}
	}
}
