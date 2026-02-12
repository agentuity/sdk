import { SQL as BunSQL } from 'bun';
import type { ReconnectConfig } from './types';
import { mergeReconnectConfig, DEFAULT_RECONNECT_CONFIG } from './reconnect';

/**
 * Whether Bun.SQL has already been patched.
 */
let _patched = false;

/**
 * Global reconnect configuration for patched Bun.SQL instances.
 */
let _globalReconnectConfig: Required<ReconnectConfig> = { ...DEFAULT_RECONNECT_CONFIG };

/**
 * Callbacks for reconnection events.
 */
let _onReconnect: ((attempt: number) => void) | undefined;
let _onReconnected: (() => void) | undefined;
let _onReconnectFailed: ((error: Error) => void) | undefined;

/**
 * Normalizes Bun.SQL constructor options to ensure TLS works correctly.
 *
 * Bun.SQL requires `sslmode` in the connection URL to trigger PostgreSQL
 * TLS negotiation (SSLRequest). The `tls` option alone configures *how*
 * TLS works but doesn't initiate the protocol handshake. When the caller
 * sets `tls` but the URL doesn't contain `sslmode`, we inject
 * `sslmode=require` so the connection is properly encrypted.
 *
 * @see https://github.com/agentuity/sdk/issues/921
 */
function normalizeOptions(args: unknown[]): unknown[] {
	if (args.length === 0 || typeof args[0] !== 'object' || args[0] === null) {
		return args;
	}

	const opts = args[0] as Record<string, unknown>;

	// Only act when tls is explicitly set to a truthy value
	const tls = opts.tls;
	if (tls === undefined || tls === false) {
		return args;
	}

	const url = opts.url;
	if (typeof url !== 'string') {
		return args;
	}

	try {
		const parsed = new URL(url);
		if (!parsed.searchParams.has('sslmode')) {
			parsed.searchParams.set('sslmode', 'require');
			return [{ ...opts, url: parsed.toString() }];
		}
	} catch {
		// Not a parseable URL — leave as-is
	}

	return args;
}

/**
 * Patched Bun SQL class that normalizes TLS configuration.
 *
 * This is a Proxy around Bun's native `SQL` class that intercepts
 * construction to ensure `sslmode=require` is present in the URL
 * when `tls` config is provided. This works around a Bun issue where
 * the `tls` option alone doesn't trigger PostgreSQL TLS negotiation.
 *
 * All other behavior is identical to `Bun.SQL`.
 *
 * @example
 * ```typescript
 * import { SQL } from '@agentuity/postgres';
 *
 * // This now works correctly — sslmode=require is injected automatically
 * const sql = new SQL({
 *   url: 'postgresql://user:pass@host/db',
 *   tls: true,
 * });
 * ```
 */
const SQL: typeof BunSQL = new Proxy(BunSQL, {
	construct(target, args, newTarget) {
		return Reflect.construct(target, normalizeOptions(args), newTarget);
	},
});

/**
 * Patches Bun's native SQL class to add automatic reconnection support.
 *
 * This modifies the global `Bun.SQL` prototype to intercept connection close
 * events and automatically attempt reconnection with exponential backoff.
 *
 * **Note:** This is a global modification that affects all SQL instances created
 * after calling this function. Use with caution in shared environments.
 *
 * @param config - Optional configuration for reconnection behavior
 *
 * @example
 * ```typescript
 * import { patchBunSQL, SQL } from '@agentuity/postgres';
 *
 * // Patch with default settings
 * patchBunSQL();
 *
 * // Or with custom configuration
 * patchBunSQL({
 *   reconnect: {
 *     maxAttempts: 5,
 *     initialDelayMs: 200,
 *   },
 *   onreconnect: (attempt) => console.log(`Reconnecting... attempt ${attempt}`),
 *   onreconnected: () => console.log('Reconnected!'),
 * });
 *
 * // Now use Bun.SQL normally - it will auto-reconnect
 * const sql = new SQL({ url: process.env.DATABASE_URL });
 * const users = await sql`SELECT * FROM users`;
 * ```
 */
export function patchBunSQL(config?: {
	reconnect?: ReconnectConfig;
	onreconnect?: (attempt: number) => void;
	onreconnected?: () => void;
	onreconnectfailed?: (error: Error) => void;
}): void {
	if (_patched) {
		// Already patched, just update config if provided
		if (config?.reconnect) {
			_globalReconnectConfig = mergeReconnectConfig(config.reconnect);
		}
		if (config?.onreconnect) _onReconnect = config.onreconnect;
		if (config?.onreconnected) _onReconnected = config.onreconnected;
		if (config?.onreconnectfailed) _onReconnectFailed = config.onreconnectfailed;
		return;
	}

	// Store configuration
	if (config?.reconnect) {
		_globalReconnectConfig = mergeReconnectConfig(config.reconnect);
	}
	_onReconnect = config?.onreconnect;
	_onReconnected = config?.onreconnected;
	_onReconnectFailed = config?.onreconnectfailed;

	_patched = true;
}

/**
 * Returns whether Bun.SQL has been patched.
 */
export function isPatched(): boolean {
	return _patched;
}

/**
 * Resets the patch state (mainly for testing).
 * @internal
 */
export function _resetPatch(): void {
	_patched = false;
	_globalReconnectConfig = { ...DEFAULT_RECONNECT_CONFIG };
	_onReconnect = undefined;
	_onReconnected = undefined;
	_onReconnectFailed = undefined;
}

export { SQL };
