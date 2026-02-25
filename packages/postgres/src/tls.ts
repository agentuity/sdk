/**
 * TLS/SSL utilities for PostgreSQL connections.
 *
 * @see https://github.com/agentuity/sdk/issues/921
 */

/**
 * Injects `sslmode=require` into a PostgreSQL connection URL when TLS is
 * requested but the URL doesn't already contain an `sslmode` parameter.
 *
 * Bun.SQL requires `sslmode` in the connection URL to trigger PostgreSQL
 * TLS negotiation (SSLRequest). The `tls` option alone configures *how*
 * TLS works but doesn't initiate the protocol handshake.
 *
 * If `sslmode` is already present in the URL (e.g. `sslmode=disable`,
 * `sslmode=prefer`), the existing value is preserved — the user's
 * explicit setting always takes precedence.
 *
 * @param url - PostgreSQL connection URL (may be undefined)
 * @param tls - TLS config value from the caller (truthy = wants TLS)
 * @returns The URL with `sslmode=require` injected, or the original URL
 *
 * @example
 * ```typescript
 * // Injects sslmode=require
 * injectSslMode('postgresql://host/db', true);
 * // => 'postgresql://host/db?sslmode=require'
 *
 * // Preserves existing sslmode
 * injectSslMode('postgresql://host/db?sslmode=prefer', true);
 * // => 'postgresql://host/db?sslmode=prefer'
 *
 * // No-op when tls is falsy
 * injectSslMode('postgresql://host/db', false);
 * // => 'postgresql://host/db'
 * ```
 */
export function injectSslMode(url: string | undefined, tls: unknown): string | undefined {
	if (!url || tls === undefined || tls === false) {
		return url;
	}

	try {
		const parsed = new URL(url);
		if (!parsed.searchParams.has('sslmode')) {
			parsed.searchParams.set('sslmode', 'require');
			return parsed.toString();
		}
	} catch {
		// Not a parseable URL — return as-is
	}

	return url;
}
