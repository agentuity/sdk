/**
 * Shared Agentuity CDN origin helpers for deploy-time asset URL wiring.
 *
 * Used by the Vite SPA adapter (absolute Vite `base`), TanStack Start
 * (runtime transformAssets / generated server entry), and Next.js
 * (`assetPrefix` via `AGENTUITY_CDN_ORIGIN`).
 *
 * URL composition at deploy time:
 *   `{cdnBaseUrl}{publicPath}/{relativeAsset}`
 *
 * Examples:
 *   base `https://cdn.agentuity.com/`
 *     + publicPath `_next/static`
 *     → `https://cdn.agentuity.com/_next/static/chunks/foo.js`
 *
 *   base `https://cdn.agentuity.com/{ORGID}/assets/`
 *     + publicPath `_next/static`
 *     → `https://cdn.agentuity.com/{ORGID}/assets/_next/static/chunks/foo.js`
 */

/** Sentinel used by pack-only mode — never treat as a real cloud deployment. */
export const PACK_ONLY_DEPLOYMENT_ID = 'pack-only';

/** Host for platform CDN object URLs (no scheme). */
export const AGENTUITY_CDN_HOST = 'cdn.agentuity.com';

export interface ResolveCdnOriginOptions {
	/**
	 * Explicit CDN base URL from `--cdn-base-url` (or equivalent).
	 * Highest priority after a direct env override check for the same flag's
	 * env form. May include a path prefix (org/assets, deployment id, etc.).
	 * Trailing slashes are stripped for the origin form.
	 */
	cdnBaseUrl?: string;
	deploymentId?: string;
	env?: NodeJS.ProcessEnv;
}

/**
 * Normalize a CDN base/origin string: trim, drop trailing slashes.
 * Returns undefined for empty input.
 */
export function normalizeCdnOrigin(value: string | undefined | null): string | undefined {
	const trimmed = value?.trim().replace(/\/+$/, '');
	return trimmed || undefined;
}

/**
 * Normalize a CDN base for frameworks that want a trailing slash
 * (Vite `base`, absolute asset URL prefixes).
 */
export function normalizeCdnBase(value: string | undefined | null): string | undefined {
	const origin = normalizeCdnOrigin(value);
	return origin ? `${origin}/` : undefined;
}

/**
 * Resolve the CDN origin without a trailing slash, e.g.
 * `https://cdn.agentuity.com/deploy_abc` or
 * `https://cdn.agentuity.com/org_123/assets`.
 *
 * Priority:
 *  1. `cdnBaseUrl` option (`--cdn-base-url`)
 *  2. `AGENTUITY_CDN_BASE_URL` env
 *  3. `AGENTUITY_CDN_ORIGIN` env (legacy / adapter-set)
 *  4. `https://cdn.agentuity.com/{deploymentId}` from option or env
 *
 * Returns undefined for local / pack-only builds when nothing explicit is set.
 */
export function resolveAgentuityCdnOrigin(
	options: ResolveCdnOriginOptions = {}
): string | undefined {
	const env = options.env ?? process.env;

	const fromOption = normalizeCdnOrigin(options.cdnBaseUrl);
	if (fromOption) return fromOption;

	const fromBaseEnv = normalizeCdnOrigin(env.AGENTUITY_CDN_BASE_URL);
	if (fromBaseEnv) return fromBaseEnv;

	const fromOriginEnv = normalizeCdnOrigin(env.AGENTUITY_CDN_ORIGIN);
	if (fromOriginEnv) return fromOriginEnv;

	const id = (options.deploymentId ?? env.AGENTUITY_CLOUD_DEPLOYMENT_ID)?.trim();
	if (!id || id === PACK_ONLY_DEPLOYMENT_ID) return undefined;

	return `https://${AGENTUITY_CDN_HOST}/${id}`;
}

/**
 * Absolute CDN base (trailing slash) for SPA chunk graphs / Vite `base`.
 * Undefined when CDN wiring should be skipped.
 */
export function resolveAgentuityCdnBase(options: ResolveCdnOriginOptions = {}): string | undefined {
	const origin = resolveAgentuityCdnOrigin(options);
	return origin ? `${origin}/` : undefined;
}
