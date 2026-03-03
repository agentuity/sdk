/**
 * Safe environment variable accessor that works in both browser and server environments.
 */
export function getEnv(key: string): string | undefined {
	if (typeof process !== 'undefined' && process.env) {
		return process.env[key];
	}
	return undefined;
}
