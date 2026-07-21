/**
 * Deploy packaging (zip only)
 * ---------------------------
 *
 * Zips the staged build tree with the canonical deploy filter.
 * Used by the real upload path and by `--pack-only`. No network I/O.
 */

import { statSync } from 'node:fs';
import type { Logger } from '@agentuity/core';
import { deployZipFilter } from '../../build/deploy-exclusions.ts';
import { zipDir } from '../../../utils/zip.ts';

export { DEPLOY_PACK_ZIP_BASENAME, deployZipFilter } from '../../build/deploy-exclusions.ts';

export interface PackageDeploymentZipResult {
	added: number;
	/** Staging candidates not packed (filter / symlink / directory). */
	skipped: number;
	outputPath: string;
	sizeBytes: number;
}

/**
 * Zip the staged deploy tree. Trace logs each candidate path.
 *
 * `skipped` counts only paths already in staging that the zip layer
 * drops. Paths excluded by `.agentuityignore` never enter staging.
 */
export async function packageDeploymentZip(params: {
	sourceDir: string;
	outputPath: string;
	logger: Pick<Logger, 'trace'>;
	/** Optional 0–100 progress callback (forwarded to zipDir). */
	progress?: (val: number) => void;
}): Promise<PackageDeploymentZipResult> {
	const { sourceDir, outputPath, logger, progress } = params;

	logger.trace('Deploy zip: source=%s output=%s', sourceDir, outputPath);

	const result = await zipDir(sourceDir, outputPath, {
		filter: deployZipFilter,
		progress,
		onEntry: ({ relative, action }) => {
			if (action === 'add') {
				logger.trace('Deploy zip: + %s', relative);
			} else {
				logger.trace('Deploy zip: skip %s (%s)', relative, action);
			}
		},
	});

	const sizeBytes = statSync(result.outputPath).size;
	logger.trace(
		'Deploy zip: done — packed %d file(s) from staging, %d not packed (filter/symlink/dir), %d bytes → %s',
		result.added,
		result.skipped,
		sizeBytes,
		result.outputPath
	);

	return {
		added: result.added,
		skipped: result.skipped,
		outputPath: result.outputPath,
		sizeBytes,
	};
}
