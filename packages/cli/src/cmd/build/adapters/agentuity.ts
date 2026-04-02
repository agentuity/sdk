/**
 * Agentuity native build adapter.
 *
 * This adapter delegates to the existing viteBundle pipeline for native
 * Agentuity projects (app.ts + @agentuity/runtime). It preserves all
 * existing behavior: agent discovery, route discovery, Bun.build,
 * db-rewrite, LLM patches, metadata generation, etc.
 *
 * This is the bridge between the new framework-agnostic build system
 * and the existing Agentuity-specific build pipeline.
 */

import { join } from 'node:path';
import type { BuildAdapter, BuildAdapterOptions, BuildResult } from './types';

export const agentuityAdapter: BuildAdapter = {
	name: 'agentuity',

	async build(options: BuildAdapterOptions): Promise<BuildResult> {
		const { projectDir, logger, collector, dev, projectId, orgId, region } = options;
		const started = Date.now();
		const logs: string[] = [];

		// Delegate to the existing viteBundle pipeline
		const { viteBundle } = await import('../vite-bundler');

		const bundleResult = await viteBundle({
			rootDir: projectDir,
			dev: dev || false,
			projectId,
			orgId,
			region: region ?? 'local',
			logger,
			collector,
		});

		logs.push(...bundleResult.output);

		return {
			outputDir: join(projectDir, '.agentuity'),
			startCommand: 'bun app.js',
			serverEntry: 'app.js',
			port: 3500,
			duration: Date.now() - started,
			logs,
		};
	},
};
