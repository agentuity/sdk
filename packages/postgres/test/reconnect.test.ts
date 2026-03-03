import { describe, test, expect } from 'bun:test';
import {
	computeBackoff,
	sleep,
	mergeReconnectConfig,
	DEFAULT_RECONNECT_CONFIG,
} from '../src/reconnect.ts';

describe('reconnect utilities', () => {
	describe('DEFAULT_RECONNECT_CONFIG', () => {
		test('should have expected default values', () => {
			expect(DEFAULT_RECONNECT_CONFIG.maxAttempts).toBe(10);
			expect(DEFAULT_RECONNECT_CONFIG.initialDelayMs).toBe(100);
			expect(DEFAULT_RECONNECT_CONFIG.maxDelayMs).toBe(30000);
			expect(DEFAULT_RECONNECT_CONFIG.multiplier).toBe(2);
			expect(DEFAULT_RECONNECT_CONFIG.jitterMs).toBe(1000);
			expect(DEFAULT_RECONNECT_CONFIG.enabled).toBe(true);
		});
	});

	describe('computeBackoff', () => {
		test('should return correct values with defaults for attempt 0', () => {
			// With defaults: initialDelayMs=100, multiplier=2, jitterMs=1000
			// For attempt 0: 100 * 2^0 = 100, plus jitter 0-1000
			const result = computeBackoff(0);
			expect(result).toBeGreaterThanOrEqual(100);
			expect(result).toBeLessThan(1100); // 100 + 1000 max jitter
		});

		test('should return correct values with defaults for attempt 1', () => {
			// For attempt 1: 100 * 2^1 = 200, plus jitter 0-1000
			const result = computeBackoff(1);
			expect(result).toBeGreaterThanOrEqual(200);
			expect(result).toBeLessThan(1200); // 200 + 1000 max jitter
		});

		test('should return correct values with defaults for attempt 2', () => {
			// For attempt 2: 100 * 2^2 = 400, plus jitter 0-1000
			const result = computeBackoff(2);
			expect(result).toBeGreaterThanOrEqual(400);
			expect(result).toBeLessThan(1400); // 400 + 1000 max jitter
		});

		test('should respect custom config', () => {
			const config = {
				initialDelayMs: 50,
				multiplier: 3,
				jitterMs: 0, // No jitter for predictable testing
				maxDelayMs: 10000,
			};

			// For attempt 0: 50 * 3^0 = 50
			expect(computeBackoff(0, config)).toBe(50);

			// For attempt 1: 50 * 3^1 = 150
			expect(computeBackoff(1, config)).toBe(150);

			// For attempt 2: 50 * 3^2 = 450
			expect(computeBackoff(2, config)).toBe(450);
		});

		test('should apply jitter within bounds', () => {
			const config = {
				initialDelayMs: 100,
				multiplier: 2,
				jitterMs: 500,
				maxDelayMs: 10000,
			};

			// Run multiple times to test jitter randomness
			const results: number[] = [];
			for (let i = 0; i < 100; i++) {
				results.push(computeBackoff(0, config));
			}

			// All results should be within expected bounds
			for (const result of results) {
				expect(result).toBeGreaterThanOrEqual(100); // base delay
				expect(result).toBeLessThan(600); // base + max jitter
			}

			// With 100 samples, we should see some variation (not all the same)
			const uniqueValues = new Set(results);
			expect(uniqueValues.size).toBeGreaterThan(1);
		});

		test('should cap at maxDelayMs', () => {
			const config = {
				initialDelayMs: 1000,
				multiplier: 10,
				jitterMs: 0, // No jitter for predictable testing
				maxDelayMs: 5000,
			};

			// For attempt 0: 1000 * 10^0 = 1000 (under cap)
			expect(computeBackoff(0, config)).toBe(1000);

			// For attempt 1: 1000 * 10^1 = 10000, capped to 5000
			expect(computeBackoff(1, config)).toBe(5000);

			// For attempt 2: 1000 * 10^2 = 100000, capped to 5000
			expect(computeBackoff(2, config)).toBe(5000);

			// For attempt 10: still capped to 5000
			expect(computeBackoff(10, config)).toBe(5000);
		});

		test('should cap at maxDelayMs before adding jitter', () => {
			const config = {
				initialDelayMs: 1000,
				multiplier: 10,
				jitterMs: 500,
				maxDelayMs: 5000,
			};

			// For attempt 2: 1000 * 10^2 = 100000, capped to 5000, plus jitter 0-500
			const result = computeBackoff(2, config);
			expect(result).toBeGreaterThanOrEqual(5000);
			expect(result).toBeLessThan(5500);
		});

		test('should return integer values (floor)', () => {
			const config = {
				initialDelayMs: 100,
				multiplier: 1.5,
				jitterMs: 100,
				maxDelayMs: 10000,
			};

			// Run multiple times to ensure we always get integers
			for (let i = 0; i < 50; i++) {
				const result = computeBackoff(1, config);
				expect(Number.isInteger(result)).toBe(true);
			}
		});

		test('should handle zero jitter', () => {
			const config = {
				initialDelayMs: 100,
				multiplier: 2,
				jitterMs: 0,
				maxDelayMs: 10000,
			};

			// With zero jitter, results should be deterministic
			expect(computeBackoff(0, config)).toBe(100);
			expect(computeBackoff(1, config)).toBe(200);
			expect(computeBackoff(2, config)).toBe(400);
		});

		test('should handle partial config (uses defaults for missing)', () => {
			// Only override initialDelayMs
			const result = computeBackoff(0, { initialDelayMs: 50 });
			// 50 * 2^0 = 50, plus default jitter 0-1000
			expect(result).toBeGreaterThanOrEqual(50);
			expect(result).toBeLessThan(1050);
		});
	});

	describe('sleep', () => {
		test('should delay for approximately the correct time', async () => {
			const start = Date.now();
			await sleep(50);
			const elapsed = Date.now() - start;

			// Allow some tolerance for timing variations
			expect(elapsed).toBeGreaterThanOrEqual(45);
			expect(elapsed).toBeLessThan(100);
		});

		test('should resolve with undefined', async () => {
			const result = await sleep(1);
			expect(result).toBeUndefined();
		});

		test('should handle zero delay', async () => {
			const start = Date.now();
			await sleep(0);
			const elapsed = Date.now() - start;

			// Should complete almost immediately
			expect(elapsed).toBeLessThan(50);
		});
	});

	describe('mergeReconnectConfig', () => {
		test('should return defaults when no config provided', () => {
			const result = mergeReconnectConfig();

			expect(result).toEqual(DEFAULT_RECONNECT_CONFIG);
		});

		test('should return defaults when undefined provided', () => {
			const result = mergeReconnectConfig(undefined);

			expect(result).toEqual(DEFAULT_RECONNECT_CONFIG);
		});

		test('should merge partial config with defaults', () => {
			const result = mergeReconnectConfig({
				maxAttempts: 5,
				initialDelayMs: 200,
			});

			expect(result.maxAttempts).toBe(5);
			expect(result.initialDelayMs).toBe(200);
			expect(result.maxDelayMs).toBe(DEFAULT_RECONNECT_CONFIG.maxDelayMs);
			expect(result.multiplier).toBe(DEFAULT_RECONNECT_CONFIG.multiplier);
			expect(result.jitterMs).toBe(DEFAULT_RECONNECT_CONFIG.jitterMs);
			expect(result.enabled).toBe(DEFAULT_RECONNECT_CONFIG.enabled);
		});

		test('should override all values when full config provided', () => {
			const customConfig = {
				maxAttempts: 3,
				initialDelayMs: 50,
				maxDelayMs: 5000,
				multiplier: 1.5,
				jitterMs: 100,
				enabled: false,
			};

			const result = mergeReconnectConfig(customConfig);

			expect(result).toEqual(customConfig);
		});

		test('should handle enabled: false', () => {
			const result = mergeReconnectConfig({ enabled: false });

			expect(result.enabled).toBe(false);
			// Other values should be defaults
			expect(result.maxAttempts).toBe(DEFAULT_RECONNECT_CONFIG.maxAttempts);
		});

		test('should not mutate the input config', () => {
			const input = { maxAttempts: 5 };
			const inputCopy = { ...input };

			mergeReconnectConfig(input);

			expect(input).toEqual(inputCopy);
		});

		test('should return a new object (not the same reference as defaults)', () => {
			const result = mergeReconnectConfig();

			expect(result).not.toBe(DEFAULT_RECONNECT_CONFIG);
			expect(result).toEqual(DEFAULT_RECONNECT_CONFIG);
		});

		test('should handle zero values correctly', () => {
			const result = mergeReconnectConfig({
				maxAttempts: 0,
				initialDelayMs: 0,
				jitterMs: 0,
			});

			expect(result.maxAttempts).toBe(0);
			expect(result.initialDelayMs).toBe(0);
			expect(result.jitterMs).toBe(0);
		});
	});
});
