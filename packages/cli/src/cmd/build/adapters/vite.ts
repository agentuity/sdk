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
		const preparation = prepareViteCdnBuild({
			projectDir: options.projectDir,
			deploymentId: options.deploymentId,
			framework: options.framework,
			logger: options.logger,
		});

		try {
			const result = await genericAdapter.build(options);
			return {
				...result,
				logs: [...preparation.logs, ...result.logs],
			};
		} finally {
			preparation.cleanup();
		}
	},
};
