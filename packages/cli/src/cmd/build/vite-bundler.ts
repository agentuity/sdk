/**
 * Vite-based bundler
 *
 * Replaces the Bun bundler with Vite for client and server builds
 */

import { join } from 'node:path';
import { existsSync } from 'node:fs';
import type { Logger } from '../../types';
import { runAllBuilds } from './vite/vite-builder';
import { StructuredError } from '@agentuity/core';

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
	} = options;

	const output: string[] = [];

	// Verify app.ts exists
	const appFile = join(rootDir, 'app.ts');
	if (!existsSync(appFile)) {
		throw new AppFileNotFoundError({
			message: `App file not found at expected location: ${appFile}`,
		});
	}

	// Verify src directory exists
	const srcDir = join(rootDir, 'src');
	if (!existsSync(srcDir)) {
		throw new BuildFailedError({
			message: `Source directory not found: ${srcDir}`,
		});
	}

	try {
		// Run all Vite builds (client -> workbench -> server)
		// Note: Always use dev=false for builds (even when --dev flag is passed)
		// The --dev flag means "development build" not "use dev server"
		logger.info('Starting Vite builds...');

		await runAllBuilds({
			rootDir,
			dev: false, // Always build in production mode for bundle command
			port,
			projectId,
			orgId,
			region,
			deploymentId,
			logger,
		});

		logger.info('Vite builds complete');
		output.push('Build successful');

		return { output };
	} catch (error) {
		logger.error('Build failed:', error);
		throw new BuildFailedError({
			message: `Build failed: ${error instanceof Error ? error.message : String(error)}`,
		});
	}
}
