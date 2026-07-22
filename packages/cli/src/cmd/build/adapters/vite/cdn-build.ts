/**
 * Vite SPA CDN build preparation (pure).
 *
 * For cloud deploys, hashed assets are uploaded to the Agentuity CDN.
 * Without an absolute Vite `base`, the SPA keeps loading `/assets/…` from
 * the app origin. This module returns command/env overrides so the adapter
 * can apply them without mutating detection results or touching disk.
 *
 * Single mechanism: inject `vite … --base=<cdn>/` into the build command.
 * If the build command does not invoke `vite`, we warn and leave base alone.
 */

import {
	PACK_ONLY_DEPLOYMENT_ID,
	resolveAgentuityCdnBase,
	resolveAgentuityCdnOrigin,
} from '../cdn-origin.ts';
import { injectViteBaseFlag } from '../vite-cli-base.ts';

export { PACK_ONLY_DEPLOYMENT_ID } from '../cdn-origin.ts';
export { injectViteBaseFlag } from '../vite-cli-base.ts';
export { resolveAgentuityCdnBase as resolveViteCdnBase } from '../cdn-origin.ts';

export interface PrepareViteCdnBuildOptions {
	deploymentId?: string;
	buildCommand: string;
	buildEnv?: Record<string, string>;
	logger: { debug: (...args: unknown[]) => void };
	env?: NodeJS.ProcessEnv;
}

export interface ViteCdnBuildOverrides {
	/** Build command after optional `--base` inject (may equal input). */
	buildCommand: string;
	/** Build env with CDN vars merged when wiring applies. */
	buildEnv?: Record<string, string>;
	logs: string[];
	/** Absolute CDN base ending with `/`, or undefined when skipped. */
	cdnBase?: string;
}

/**
 * Compute CDN base overrides for a Vite deploy build.
 * Pure: does not mutate inputs or touch the filesystem.
 */
export function prepareViteCdnBuild(options: PrepareViteCdnBuildOptions): ViteCdnBuildOverrides {
	const env = options.env ?? process.env;
	const logs: string[] = [];

	const cdnBase = resolveAgentuityCdnBase({
		deploymentId: options.deploymentId,
		env,
	});

	if (!cdnBase) {
		options.logger.debug('Vite CDN base: skipped (no deployment id / AGENTUITY_CDN_ORIGIN)');
		return {
			buildCommand: options.buildCommand,
			buildEnv: options.buildEnv,
			logs,
		};
	}

	const cdnOrigin = resolveAgentuityCdnOrigin({
		deploymentId: options.deploymentId,
		env,
	});
	const deploymentId =
		options.deploymentId?.trim() || env.AGENTUITY_CLOUD_DEPLOYMENT_ID?.trim() || undefined;

	const buildEnv: Record<string, string> = {
		...options.buildEnv,
		...(cdnOrigin ? { AGENTUITY_CDN_ORIGIN: cdnOrigin } : {}),
		...(deploymentId && deploymentId !== PACK_ONLY_DEPLOYMENT_ID
			? { AGENTUITY_CLOUD_DEPLOYMENT_ID: deploymentId }
			: {}),
	};

	const buildCommand = injectViteBaseFlag(options.buildCommand, cdnBase);
	if (buildCommand !== options.buildCommand) {
		logs.push(`✓ Vite CDN base via CLI: --base=${cdnBase}`);
		options.logger.debug('Vite CDN: injected --base into build command');
	} else {
		logs.push(
			'⚠ Vite CDN: build command does not invoke vite; could not inject --base — asset URLs may stay on the app origin'
		);
		options.logger.debug(
			'Vite CDN: build command %j has no vite segment for --base inject',
			options.buildCommand
		);
	}

	return {
		cdnBase,
		buildCommand,
		buildEnv,
		logs,
	};
}
