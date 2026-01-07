/**
 * CORS trusted origin helpers for same-origin configuration.
 *
 * Provides the same trusted-origin logic as @agentuity/auth,
 * allowing CORS to be restricted to platform-trusted domains.
 */

import type { Context } from 'hono';

/**
 * Safely extract origin from a URL string.
 * Returns undefined if the URL is invalid.
 */
function safeOrigin(url: string | undefined): string | undefined {
	if (!url) return undefined;
	try {
		return new URL(url).origin;
	} catch {
		return undefined;
	}
}

/**
 * Parse an origin-like value (URL or bare domain) into a normalized origin.
 *
 * - Full URLs (http://... or https://...) are parsed as-is
 * - Bare domains (example.com) are treated as https://
 * - Invalid values return undefined
 */
function parseOriginLike(value: string): string | undefined {
	const trimmed = value.trim();
	if (!trimmed) return undefined;

	// If it looks like a URL (has a scheme), parse directly
	if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)) {
		return safeOrigin(trimmed);
	}

	// Otherwise, treat as host[:port] and assume https
	return safeOrigin(`https://${trimmed}`);
}

/**
 * Build the static trusted origins set from environment variables.
 *
 * Reads from:
 * - AGENTUITY_BASE_URL - The base URL for the deployment
 * - AGENTUITY_CLOUD_DOMAINS - Platform-set domains (comma-separated)
 * - AUTH_TRUSTED_DOMAINS - Developer-set additional domains (comma-separated)
 */
function buildEnvTrustedOrigins(): Set<string> {
	const agentuityURL = process.env.AGENTUITY_BASE_URL;
	const cloudDomains = process.env.AGENTUITY_CLOUD_DOMAINS;
	const devTrustedDomains = process.env.AUTH_TRUSTED_DOMAINS;

	const origins = new Set<string>();

	const agentuityOrigin = safeOrigin(agentuityURL);
	if (agentuityOrigin) origins.add(agentuityOrigin);

	// Platform-set cloud domains (deployment, project, PR, custom domains, tunnels)
	if (cloudDomains) {
		for (const raw of cloudDomains.split(',')) {
			const origin = parseOriginLike(raw);
			if (origin) origins.add(origin);
		}
	}

	// Developer-set additional trusted domains
	if (devTrustedDomains) {
		for (const raw of devTrustedDomains.split(',')) {
			const origin = parseOriginLike(raw);
			if (origin) origins.add(origin);
		}
	}

	return origins;
}

/**
 * Options for createTrustedCorsOrigin.
 */
export interface TrustedCorsOriginOptions {
	/**
	 * Additional origins to allow on top of environment-derived ones.
	 * Can be full URLs (https://example.com) or bare domains (example.com).
	 */
	allowedOrigins?: string[];
}

/**
 * Create a Hono CORS origin callback that only allows trusted origins.
 *
 * Trusted origins are derived from:
 * - AGENTUITY_BASE_URL environment variable
 * - AGENTUITY_CLOUD_DOMAINS environment variable (comma-separated)
 * - AUTH_TRUSTED_DOMAINS environment variable (comma-separated)
 * - The same-origin of the incoming request URL
 * - Any additional origins specified in allowedOrigins option
 *
 * @example
 * ```typescript
 * import { createApp, createTrustedCorsOrigin } from '@agentuity/runtime';
 *
 * await createApp({
 *   cors: {
 *     origin: createTrustedCorsOrigin({
 *       allowedOrigins: ['https://admin.myapp.com'],
 *     }),
 *   },
 * });
 * ```
 */
export function createTrustedCorsOrigin(
	options?: TrustedCorsOriginOptions
): (origin: string, c: Context) => string | undefined {
	// Build static origins from env vars at creation time
	const baseOrigins = buildEnvTrustedOrigins();

	// Add any extra origins from options
	if (options?.allowedOrigins) {
		for (const raw of options.allowedOrigins) {
			const origin = parseOriginLike(raw);
			if (origin) baseOrigins.add(origin);
		}
	}

	return (origin: string, c: Context): string | undefined => {
		// Build allowed set per-request to include same-origin of the server
		const allowed = new Set(baseOrigins);
		const requestOrigin = safeOrigin(c.req.url);
		if (requestOrigin) allowed.add(requestOrigin);

		// Only echo back if trusted; otherwise return undefined (no CORS header)
		return allowed.has(origin) ? origin : undefined;
	};
}
