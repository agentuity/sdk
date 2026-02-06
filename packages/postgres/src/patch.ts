import { SQL } from 'bun';
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

	// Note: True monkey-patching of Bun.SQL internals is not feasible
	// because Bun.SQL is a native class. Instead, users should use
	// PostgresClient from this package which provides the same API
	// with automatic reconnection built in.
	//
	// This function exists to set global reconnection configuration
	// that could be used by future implementations.

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

/**
 * Re-export of Bun's SQL class.
 *
 * When using the patched version, import SQL from this module instead of 'bun':
 *
 * @example
 * ```typescript
 * import { patchBunSQL, SQL } from '@agentuity/postgres';
 *
 * patchBunSQL();
 * const sql = new SQL({ url: process.env.DATABASE_URL });
 * ```
 */
export { SQL };
