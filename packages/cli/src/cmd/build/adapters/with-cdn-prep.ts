/**
 * Adapter factory: run CDN preparation, then the generic (or custom) build,
 * always cleaning up prep state.
 */

import type { DetectedFramework } from '../detect/types.ts';
import type { BuildAdapter, BuildAdapterOptions, BuildResult } from './types.ts';
import { genericAdapter } from './generic.ts';
import type { CdnPrepResult } from './config-cdn-wrap.ts';

export type CdnPrepareFn = (options: BuildAdapterOptions) => CdnPrepResult;

export interface WithCdnPrepOptions {
	name: string;
	prepare: CdnPrepareFn;
	/**
	 * Extra framework fields to merge for the build (e.g. cleared
	 * buildFileReplacements, rewritten buildCommand).
	 */
	frameworkOverrides?: (
		prep: CdnPrepResult,
		framework: DetectedFramework
	) => Partial<DetectedFramework>;
	/**
	 * Custom build body. Defaults to genericAdapter.build.
	 * Receives options already patched with prep.buildEnv / overrides.
	 */
	build?: (options: BuildAdapterOptions, prep: CdnPrepResult) => Promise<BuildResult>;
}

/**
 * Create a BuildAdapter that runs CDN prep, builds, then cleanup.
 *
 * `prepare` is expected to roll back its own mutations if it throws
 * (see `prepareConfigCdn`). Once prepare returns, we always call
 * `prep.cleanup()` in `finally` after the build.
 */
export function withCdnPrep(opts: WithCdnPrepOptions): BuildAdapter {
	return {
		name: opts.name,
		async build(options: BuildAdapterOptions): Promise<BuildResult> {
			// prepareConfigCdn is transactional on throw; other prepare fns
			// (Vite pure, TanStack) either mutate nothing or clean themselves.
			const prep = opts.prepare(options);
			try {
				const fromFactory = opts.frameworkOverrides?.(prep, options.framework) ?? {};
				const fromPrep = prep.frameworkPatch ?? {};
				const patched: BuildAdapterOptions = {
					...options,
					framework: {
						...options.framework,
						...fromPrep,
						...fromFactory,
						buildEnv: {
							...options.framework.buildEnv,
							...prep.buildEnv,
						},
					},
				};

				const result = opts.build
					? await opts.build(patched, prep)
					: await genericAdapter.build(patched);

				return {
					...result,
					logs: [...prep.logs, ...result.logs],
				};
			} finally {
				prep.cleanup();
			}
		},
	};
}
