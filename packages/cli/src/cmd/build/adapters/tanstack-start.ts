/**
 * TanStack Start build adapter — server entry + Vite base CDN prep, then generic.
 */

import { withCdnPrep } from './with-cdn-prep.ts';
import { prepareTanStackCdnBuild } from './tanstack-start/cdn-build.ts';
import type { CdnPrepResult } from './config-cdn-wrap.ts';
import type { BuildAdapterOptions } from './types.ts';

function prepareTanStack(options: BuildAdapterOptions): CdnPrepResult {
	const preparation = prepareTanStackCdnBuild({
		projectDir: options.projectDir,
		logger: options.logger,
		cdnBaseUrl: options.cdnBaseUrl,
		deploymentId: options.deploymentId,
	});
	return {
		buildEnv: preparation.buildEnv,
		logs: preparation.logs,
		cdnOrigin: preparation.cdnOrigin,
		cleanup: preparation.cleanup,
	};
}

export const tanstackStartAdapter = withCdnPrep({
	name: 'tanstack-start',
	prepare: prepareTanStack,
});
