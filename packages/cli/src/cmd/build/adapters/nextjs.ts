/**
 * Next.js build adapter.
 *
 * Handles Next.js-specific build concerns:
 * 1. Ensures standalone output mode is configured
 * 2. Copies the standalone directory + static assets to output
 * 3. Sets up the correct start command
 */

import { join } from 'node:path';
import { cpSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import type { BuildAdapter, BuildAdapterOptions, BuildResult } from './types.ts';
import { installDependencies, runBuildCommand } from './generic.ts';

/**
 * Ensure next.config has output: 'standalone'.
 *
 * Rather than modifying the user's config file, we set the NEXT_OUTPUT env var
 * which can be read in next.config.js, or we check if standalone is already configured.
 * As a fallback, we also set the experimental config via env.
 */
function getNextBuildEnv(): Record<string, string> {
	return {
		// Signal to the build that we want standalone output
		NEXT_PRIVATE_STANDALONE: 'true',
	};
}

export const nextjsAdapter: BuildAdapter = {
	name: 'nextjs',

	async build(options: BuildAdapterOptions): Promise<BuildResult> {
		const { projectDir, framework, outputDir, logger } = options;
		const started = Date.now();
		const logs: string[] = [];

		// Step 1: Install dependencies
		logger.debug('Installing dependencies...');
		const installStart = Date.now();
		await installDependencies(projectDir, framework.packageManager, logger);
		logs.push(`✓ Dependencies installed in ${Date.now() - installStart}ms`);

		// Step 2: Check if standalone mode is configured
		const nextConfigPath = await findNextConfig(projectDir);
		let standaloneConfigured = false;
		if (nextConfigPath) {
			const content = readFileSync(nextConfigPath, 'utf-8');
			standaloneConfigured =
				content.includes("'standalone'") || content.includes('"standalone"');
		}

		if (!standaloneConfigured) {
			logger.debug(
				'Standalone output not detected in next.config — setting NEXT_PRIVATE_STANDALONE=true'
			);
		}

		// Step 3: Run the build with standalone env
		const buildEnv = {
			...framework.buildEnv,
			...getNextBuildEnv(),
		};

		logger.debug(`Running Next.js build: ${framework.buildCommand}`);
		const buildStart = Date.now();
		await runBuildCommand(
			projectDir,
			framework.buildCommand,
			framework.packageManager,
			buildEnv,
			logger
		);
		logs.push(`✓ Next.js build completed in ${Date.now() - buildStart}ms`);

		// Step 4: Package the standalone output
		mkdirSync(outputDir, { recursive: true });

		const standalonePath = join(projectDir, '.next', 'standalone');
		const staticPath = join(projectDir, '.next', 'static');
		const publicPath = join(projectDir, 'public');

		if (existsSync(standalonePath)) {
			// Copy standalone server
			logger.debug('Copying standalone server...');
			cpSync(standalonePath, outputDir, { recursive: true });

			// Copy static assets into .next/static within the output
			if (existsSync(staticPath)) {
				const staticDst = join(outputDir, '.next', 'static');
				mkdirSync(staticDst, { recursive: true });
				cpSync(staticPath, staticDst, { recursive: true });
			}

			// Copy public assets
			if (existsSync(publicPath)) {
				const publicDst = join(outputDir, 'public');
				mkdirSync(publicDst, { recursive: true });
				cpSync(publicPath, publicDst, { recursive: true });
			}

			logs.push('✓ Standalone output packaged');
		} else {
			// Fallback: copy the whole .next directory
			logger.debug('No standalone output found — copying full .next directory');
			const nextDst = join(outputDir, '.next');
			cpSync(join(projectDir, '.next'), nextDst, { recursive: true });

			// Copy package.json and node_modules
			cpSync(join(projectDir, 'package.json'), join(outputDir, 'package.json'));
			if (existsSync(join(projectDir, 'node_modules'))) {
				cpSync(join(projectDir, 'node_modules'), join(outputDir, 'node_modules'), {
					recursive: true,
				});
			}

			logs.push('⚠ No standalone output — using full build (consider enabling standalone mode)');
		}

		// Determine start command based on what we have
		const hasStandalone = existsSync(join(outputDir, 'server.js'));
		const startCommand = hasStandalone ? 'node server.js' : 'node node_modules/.bin/next start';

		return {
			outputDir,
			startCommand,
			serverEntry: hasStandalone ? 'server.js' : undefined,
			staticDir: existsSync(join(outputDir, '.next', 'static'))
				? join(outputDir, '.next', 'static')
				: undefined,
			port: framework.port ?? 3000,
			duration: Date.now() - started,
			logs,
		};
	},
};

async function findNextConfig(projectDir: string): Promise<string | null> {
	const candidates = ['next.config.js', 'next.config.mjs', 'next.config.ts', 'next.config.cjs'];

	for (const name of candidates) {
		const path = join(projectDir, name);
		if (existsSync(path)) return path;
	}

	return null;
}
