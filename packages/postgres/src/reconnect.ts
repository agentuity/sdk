import type { ReconnectConfig } from './types';

/**
 * Default reconnection configuration values.
 */
export const DEFAULT_RECONNECT_CONFIG: Required<ReconnectConfig> = {
	maxAttempts: 10,
	initialDelayMs: 100,
	maxDelayMs: 30000,
	multiplier: 2,
	jitterMs: 1000,
	enabled: true,
};

/**
 * Computes the backoff delay for a reconnection attempt using exponential backoff with jitter.
 *
 * The delay is calculated as:
 * `min(maxDelayMs, initialDelayMs * (multiplier ^ attempt)) + random(0, jitterMs)`
 *
 * @param attempt - The current attempt number (0-indexed)
 * @param config - Reconnection configuration
 * @returns The delay in milliseconds before the next reconnection attempt
 */
export function computeBackoff(attempt: number, config: Partial<ReconnectConfig> = {}): number {
	const {
		initialDelayMs = DEFAULT_RECONNECT_CONFIG.initialDelayMs,
		maxDelayMs = DEFAULT_RECONNECT_CONFIG.maxDelayMs,
		multiplier = DEFAULT_RECONNECT_CONFIG.multiplier,
		jitterMs = DEFAULT_RECONNECT_CONFIG.jitterMs,
	} = config;

	// Calculate exponential delay
	const exponentialDelay = initialDelayMs * Math.pow(multiplier, attempt);

	// Cap at maximum delay
	const cappedDelay = Math.min(exponentialDelay, maxDelayMs);

	// Add random jitter to prevent thundering herd
	const jitter = Math.random() * jitterMs;

	return Math.floor(cappedDelay + jitter);
}

/**
 * Sleeps for the specified number of milliseconds.
 *
 * @param ms - The number of milliseconds to sleep
 * @returns A promise that resolves after the specified delay
 */
export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Merges user-provided reconnect config with defaults.
 *
 * @param config - User-provided reconnect configuration
 * @returns Complete reconnect configuration with all values filled in
 */
export function mergeReconnectConfig(config?: Partial<ReconnectConfig>): Required<ReconnectConfig> {
	if (!config) {
		return { ...DEFAULT_RECONNECT_CONFIG };
	}

	return {
		maxAttempts: config.maxAttempts ?? DEFAULT_RECONNECT_CONFIG.maxAttempts,
		initialDelayMs: config.initialDelayMs ?? DEFAULT_RECONNECT_CONFIG.initialDelayMs,
		maxDelayMs: config.maxDelayMs ?? DEFAULT_RECONNECT_CONFIG.maxDelayMs,
		multiplier: config.multiplier ?? DEFAULT_RECONNECT_CONFIG.multiplier,
		jitterMs: config.jitterMs ?? DEFAULT_RECONNECT_CONFIG.jitterMs,
		enabled: config.enabled ?? DEFAULT_RECONNECT_CONFIG.enabled,
	};
}
