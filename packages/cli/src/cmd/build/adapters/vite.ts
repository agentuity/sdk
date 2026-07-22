/**
 * Vite SPA build adapter.
 *
 * Runs the generic monorepo/single-package pipeline after applying CDN
 * asset base wiring so hashed client URLs point at Agentuity CDN on deploy.
 */

import type { BuildAdapter, BuildAdapterOptions, BuildResult } from './types.ts';
import { genericAdapter } from './generic.ts';
import { prepareViteCdnBuild } from './vite/cdn-build.ts';

export const viteAdapter: BuildAdapter = {
	name: 'vite',

	async build(options: BuildAdapterOptions): Promise<BuildResult> {
		const overrides = prepareViteCdnBuild({
			deploymentId: options.deploymentId,
			buildCommand: options.framework.buildCommand,
			buildEnv: options.framework.buildEnv,
			logger: options.logger,
		});

		// Apply overrides on a shallow framework copy — never mutate detection results.
		const result = await genericAdapter.build({
			...options,
			framework: {
				...options.framework,
				buildCommand: overrides.buildCommand,
				buildEnv: overrides.buildEnv,
			},
		});

		return {
			...result,
			logs: [...overrides.logs, ...result.logs],
		};
	},
};
