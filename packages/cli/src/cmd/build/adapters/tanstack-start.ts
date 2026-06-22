/**
 * TanStack Start build adapter.
 *
 * Runs the generic build pipeline after applying CDN wiring (server entry +
 * Vite base) required for Agentuity static asset delivery.
 */

import type { BuildAdapter, BuildAdapterOptions, BuildResult } from './types.ts';
import { genericAdapter } from './generic.ts';
import { prepareTanStackCdnBuild } from './tanstack-start/cdn-build.ts';

export const tanstackStartAdapter: BuildAdapter = {
	name: 'tanstack-start',

	async build(options: BuildAdapterOptions): Promise<BuildResult> {
		const preparation = prepareTanStackCdnBuild(options.projectDir, options.logger);

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
