/**
 * Vite SPA build adapter — inject CDN `--base`, then generic build.
 */

import { withCdnPrep } from './with-cdn-prep.ts';
import { prepareViteCdnBuild } from './vite/cdn-build.ts';
import type { CdnPrepResult } from './config-cdn-wrap.ts';
import type { BuildAdapterOptions } from './types.ts';

function prepareVite(options: BuildAdapterOptions): CdnPrepResult {
	const overrides = prepareViteCdnBuild({
		cdnBaseUrl: options.cdnBaseUrl,
		deploymentId: options.deploymentId,
		buildCommand: options.framework.buildCommand,
		buildEnv: options.framework.buildEnv,
		logger: options.logger,
	});
	return {
		buildEnv: overrides.buildEnv ?? {},
		logs: overrides.logs,
		cdnBase: overrides.cdnBase,
		cdnOrigin: overrides.cdnOrigin,
		cleanup: () => {},
		frameworkPatch: {
			buildCommand: overrides.buildCommand,
		},
	};
}

export const viteAdapter = withCdnPrep({
	name: 'vite',
	prepare: prepareVite,
});
