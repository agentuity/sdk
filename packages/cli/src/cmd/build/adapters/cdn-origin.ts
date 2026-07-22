/**
 * Shared Agentuity CDN origin helpers for deploy-time asset URL wiring.
 *
 * Used by the Vite SPA adapter (absolute Vite `base`) and TanStack Start
 * (runtime transformAssets / generated server entry).
 */

/** Sentinel used by pack-only mode — never treat as a real cloud deployment. */
export const PACK_ONLY_DEPLOYMENT_ID = 'pack-only';

/** Host for platform CDN object URLs (no scheme). */
export const AGENTUITY_CDN_HOST = 'cdn.agentuity.com';

export interface ResolveCdnOriginOptions {
	deploymentId?: string;
	env?: NodeJS.ProcessEnv;
}

/**
 * Resolve the CDN origin without a trailing slash, e.g.
 * `https://cdn.agentuity.com/deploy_abc`.
 *
 * Prefer `AGENTUITY_CDN_ORIGIN` when set; otherwise build from deployment id.
 * Returns undefined for local / pack-only builds.
 */
export function resolveAgentuityCdnOrigin(
	options: ResolveCdnOriginOptions = {}
): string | undefined {
	const env = options.env ?? process.env;
	const explicit = env.AGENTUITY_CDN_ORIGIN?.trim().replace(/\/+$/, '');
	if (explicit) return explicit;

	const id = (options.deploymentId ?? env.AGENTUITY_CLOUD_DEPLOYMENT_ID)?.trim();
	if (!id || id === PACK_ONLY_DEPLOYMENT_ID) return undefined;

	return `https://${AGENTUITY_CDN_HOST}/${id}`;
}

/**
 * Absolute Vite `base` (trailing slash) for SPA chunk graphs.
 * Undefined when CDN wiring should be skipped.
 */
export function resolveAgentuityCdnBase(options: ResolveCdnOriginOptions = {}): string | undefined {
	const origin = resolveAgentuityCdnOrigin(options);
	return origin ? `${origin}/` : undefined;
}
