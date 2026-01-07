/**
 * Helpers for managing global app config in tests.
 *
 * These utilities use a save/restore pattern to prevent race conditions
 * when multiple test files run in the same process and share globalThis.
 */

const APP_CONFIG_KEY = '__AGENTUITY_APP_CONFIG__';

/**
 * Get the current app config value (may be undefined).
 */
export function getTestAppConfig(): unknown {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return (globalThis as any)[APP_CONFIG_KEY];
}

/**
 * Set the app config to a specific value.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setTestAppConfig(config: any): void {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(globalThis as any)[APP_CONFIG_KEY] = config;
}

/**
 * Clear the app config (delete the global key).
 */
export function clearTestAppConfig(): void {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	delete (globalThis as any)[APP_CONFIG_KEY];
}

/**
 * Run a function with a specific app config, then restore the previous value.
 * This prevents race conditions with other test files.
 *
 * @example
 * await withAppConfig({ compression: false }, async () => {
 *   // app config is { compression: false } here
 *   const res = await app.request('/test');
 *   expect(res.headers.get('Content-Encoding')).toBeNull();
 * });
 * // app config is restored to previous value here
 */
export async function withAppConfig<T>(
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	config: any,
	fn: () => Promise<T> | T
): Promise<T> {
	const prev = getTestAppConfig();
	setTestAppConfig(config);
	try {
		return await fn();
	} finally {
		if (prev === undefined) {
			clearTestAppConfig();
		} else {
			setTestAppConfig(prev);
		}
	}
}

/**
 * Run a function with cleared app config, then restore the previous value.
 */
export async function withClearedAppConfig<T>(fn: () => Promise<T> | T): Promise<T> {
	const prev = getTestAppConfig();
	clearTestAppConfig();
	try {
		return await fn();
	} finally {
		if (prev === undefined) {
			clearTestAppConfig();
		} else {
			setTestAppConfig(prev);
		}
	}
}
