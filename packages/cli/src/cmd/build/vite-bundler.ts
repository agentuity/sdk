/**
 * Vite-based bundler
 *
 * Replaces the Bun bundler with Vite for client and server builds
 */

import { join } from 'node:path';
import { stat } from 'node:fs/promises';
import { StructuredError } from '@agentuity/core';
import type { Logger, DeployOptions } from '../../types';
import { runAllBuilds } from './vite/vite-builder';
import { checkAndUpgradeDependencies } from '../../utils/dependency-checker';
import { checkBunVersion } from '../../utils/bun-version-checker';
import * as tui from '../../tui';
import type { BuildReportCollector } from '../../build-report';

const AppFileNotFoundError = StructuredError('AppFileNotFoundError');
const BuildFailedError = StructuredError('BuildFailedError');

export interface ViteBundleOptions {
	rootDir: string;
	dev?: boolean;
	projectId?: string;
	orgId?: string;
	region?: string;
	deploymentId?: string;
	port?: number;
	logger: Logger;
	deploymentOptions?: DeployOptions;
	/** Optional collector for structured error reporting */
	collector?: BuildReportCollector;
}

/**
 * Bundle the project using Vite
 */
export async function viteBundle(options: ViteBundleOptions): Promise<{ output: string[] }> {
	const {
		rootDir,
		projectId = '',
		orgId = '',
		region = 'local',
		deploymentId = '',
		port = 3500,
		logger,
		deploymentOptions,
		collector,
	} = options;

	const output: string[] = [];

	// Check Bun version meets minimum requirements
	const versionOutput = await checkBunVersion();
	output.push(...versionOutput);

	// Verify app.ts exists
	const appFile = join(rootDir, 'app.ts');
	if (!(await Bun.file(appFile).exists())) {
		const errorMessage = `App file not found at expected location: ${appFile}`;
		collector?.addGeneralError('build', errorMessage, 'BUILD001');
		throw new AppFileNotFoundError({
			message: errorMessage,
		});
	}

	// Verify src directory exists
	const srcDir = join(rootDir, 'src');
	const srcDirExists = await stat(srcDir)
		.then((s) => s.isDirectory())
		.catch(() => false);
	if (!srcDirExists) {
		const errorMessage = `Source directory not found: ${srcDir}`;
		collector?.addGeneralError('build', errorMessage, 'BUILD002');
		throw new BuildFailedError({
			message: errorMessage,
		});
	}

	// Check and upgrade @agentuity/* dependencies if needed
	const upgradeResult = await checkAndUpgradeDependencies(rootDir, logger);
	if (upgradeResult.failed.length > 0 && process.stdin.isTTY) {
		const errorMessage = `Failed to upgrade dependencies: ${upgradeResult.failed.join(', ')}`;
		collector?.addGeneralError('build', errorMessage, 'BUILD003');
		throw new BuildFailedError({
			message: errorMessage,
		});
	}

	try {
		// Run all builds (client -> workbench -> server)
		logger.debug('Starting builds...');

		const result = await runAllBuilds({
			rootDir,
			dev: options.dev || false, // Pass through dev flag for development builds
			port,
			projectId,
			orgId,
			region,
			deploymentId,
			logger,
			deploymentOptions,
			collector,
		});

		if (result.client.included) {
			output.push(tui.muted(`✓ Client built in ${result.client.duration}ms`));
		}
		if (result.workbench.included) {
			output.push(tui.muted(`✓ Workbench built in ${result.workbench.duration}ms`));
		}
		if (result.server.included) {
			output.push(tui.muted(`✓ Server built in ${result.server.duration}ms`));
		}

		logger.debug('All builds complete');

		return { output };
	} catch (error) {
		const errorMessage = `Build failed: ${error instanceof Error ? error.message : String(error)}`;
		collector?.addGeneralError('build', errorMessage, 'BUILD004');
		throw new BuildFailedError({
			message: errorMessage,
		});
	}
}
