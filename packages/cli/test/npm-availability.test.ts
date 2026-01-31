import { describe, test, expect, afterEach } from 'bun:test';
import { mockFetch } from '@agentuity/test-utils';
import {
	isVersionAvailableOnNpm,
	isVersionAvailableOnNpmQuick,
	waitForNpmAvailability,
} from '../src/cmd/upgrade/npm-availability';

// Relaxed timing thresholds for CI stability
// These are intentionally generous to avoid flaky tests across different environments
const TIMING = {
	/** Max time for a "fast" operation (no network delay, just mock response) */
	FAST_OPERATION_MS: 500,
	/** Quick check timeout (1 second) - we check it completes before the slow response */
	QUICK_TIMEOUT_MS: 1000,
	/** Buffer above the quick timeout to account for CI variance */
	QUICK_TIMEOUT_UPPER_MS: 1800,
	/** Buffer below the quick timeout - it should wait at least this long */
	QUICK_TIMEOUT_LOWER_MS: 800,
	/** Max time for slow response that should be aborted */
	SLOW_RESPONSE_MS: 2000,
};

describe('npm-availability', () => {
	const originalFetch = globalThis.fetch;

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	describe('isVersionAvailableOnNpm', () => {
		test('returns true for existing version (200 response)', async () => {
			const mockedFetch = mockFetch(async () => new Response(null, { status: 200 }));

			const result = await isVersionAvailableOnNpm('1.2.3');

			expect(result).toBe(true);
			expect(mockedFetch).toHaveBeenCalledTimes(1);
		});

		test('returns true for version with v prefix', async () => {
			const mockedFetch = mockFetch(async () => new Response(null, { status: 200 }));

			const result = await isVersionAvailableOnNpm('v1.2.3');

			expect(result).toBe(true);
			// Should strip the v prefix in the URL
			const callArgs = mockedFetch.mock.calls[0] as [string, RequestInit | undefined];
			expect(callArgs[0]).toContain('/1.2.3');
			expect(callArgs[0]).not.toContain('/v1.2.3');
		});

		test('returns false for non-existing version (404 response)', async () => {
			mockFetch(async () => new Response(null, { status: 404 }));

			const result = await isVersionAvailableOnNpm('99.99.99');

			expect(result).toBe(false);
		});

		test('returns false on network error', async () => {
			mockFetch(async () => {
				throw new Error('Network error');
			});

			const result = await isVersionAvailableOnNpm('1.2.3');

			expect(result).toBe(false);
		});

		test('returns false on timeout', async () => {
			mockFetch(
				() =>
					new Promise<Response>((_, reject) => {
						setTimeout(() => reject(new Error('Timeout')), 100);
					})
			);

			const result = await isVersionAvailableOnNpm('1.2.3');

			expect(result).toBe(false);
		});

		test('uses HEAD method for efficiency', async () => {
			const mockedFetch = mockFetch(async () => new Response(null, { status: 200 }));

			await isVersionAvailableOnNpm('1.2.3');

			const callArgs = mockedFetch.mock.calls[0] as [string, RequestInit | undefined];
			expect(callArgs[1]?.method).toBe('HEAD');
		});

		test('constructs correct npm registry URL', async () => {
			const mockedFetch = mockFetch(async () => new Response(null, { status: 200 }));

			await isVersionAvailableOnNpm('1.2.3');

			const callArgs = mockedFetch.mock.calls[0] as [string, RequestInit | undefined];
			expect(callArgs[0]).toBe('https://registry.npmjs.org/%40agentuity%2Fcli/1.2.3');
		});

		test('accepts custom timeout option', async () => {
			const mockedFetch = mockFetch(async () => new Response(null, { status: 200 }));

			const result = await isVersionAvailableOnNpm('1.2.3', { timeoutMs: 500 });

			expect(result).toBe(true);
			expect(mockedFetch).toHaveBeenCalledTimes(1);
		});
	});

	describe('isVersionAvailableOnNpmQuick', () => {
		test('returns true for existing version', async () => {
			mockFetch(async () => new Response(null, { status: 200 }));

			const result = await isVersionAvailableOnNpmQuick('1.2.3');

			expect(result).toBe(true);
		});

		test('returns false for non-existing version', async () => {
			mockFetch(async () => new Response(null, { status: 404 }));

			const result = await isVersionAvailableOnNpmQuick('99.99.99');

			expect(result).toBe(false);
		});

		test('returns false on network error without blocking', async () => {
			mockFetch(async () => {
				throw new Error('Network error');
			});

			const startTime = Date.now();
			const result = await isVersionAvailableOnNpmQuick('1.2.3');
			const elapsed = Date.now() - startTime;

			expect(result).toBe(false);
			// Should return quickly, not block for the full timeout
			expect(elapsed).toBeLessThan(TIMING.FAST_OPERATION_MS);
		});

		test('uses short timeout (1 second) for quick checks', async () => {
			// This test verifies the quick check uses a short timeout
			// We mock fetch to check the signal's timeout and simulate abort
			let fetchCalled = false;
			let receivedSignal: AbortSignal | null | undefined;

			mockFetch(async (_url: string, init?: RequestInit) => {
				fetchCalled = true;
				receivedSignal = init?.signal;

				// Return a promise that respects the abort signal
				return new Promise<Response>((resolve, reject) => {
					const timeoutId = setTimeout(() => {
						resolve(new Response(null, { status: 200 }));
					}, TIMING.SLOW_RESPONSE_MS);

					// Listen for abort
					if (init?.signal) {
						init.signal.addEventListener('abort', () => {
							clearTimeout(timeoutId);
							reject(new DOMException('Aborted', 'AbortError'));
						});
					}
				});
			});

			const startTime = Date.now();
			const result = await isVersionAvailableOnNpmQuick('1.2.3');
			const elapsed = Date.now() - startTime;

			expect(fetchCalled).toBe(true);
			expect(receivedSignal).toBeDefined();
			expect(result).toBe(false); // Should timeout and return false
			// Should timeout around 1 second, not wait for the full slow response time
			expect(elapsed).toBeLessThan(TIMING.QUICK_TIMEOUT_UPPER_MS);
			expect(elapsed).toBeGreaterThan(TIMING.QUICK_TIMEOUT_LOWER_MS);
		});
	});

	describe('waitForNpmAvailability', () => {
		test('returns true immediately if version is available', async () => {
			const mockedFetch = mockFetch(async () => new Response(null, { status: 200 }));

			const result = await waitForNpmAvailability('1.2.3');

			expect(result).toBe(true);
			// Should only check once
			expect(mockedFetch).toHaveBeenCalledTimes(1);
		});

		test('retries and succeeds on second attempt', async () => {
			let callCount = 0;
			mockFetch(async () => {
				callCount++;
				if (callCount === 1) {
					return new Response(null, { status: 404 });
				}
				return new Response(null, { status: 200 });
			});

			const result = await waitForNpmAvailability('1.2.3', {
				initialDelayMs: 10, // Short delay for testing
				maxAttempts: 3,
			});

			expect(result).toBe(true);
			expect(callCount).toBe(2);
		});

		test('returns false after max attempts', async () => {
			const mockedFetch = mockFetch(async () => new Response(null, { status: 404 }));

			const result = await waitForNpmAvailability('1.2.3', {
				maxAttempts: 3,
				initialDelayMs: 10,
			});

			expect(result).toBe(false);
			// Initial check + (maxAttempts - 1) retries = 3 total
			expect(mockedFetch).toHaveBeenCalledTimes(3);
		});

		test('calls onRetry callback with correct arguments', async () => {
			mockFetch(async () => new Response(null, { status: 404 }));

			const retryArgs: Array<[number, number]> = [];
			const onRetry = (attempt: number, delayMs: number) => {
				retryArgs.push([attempt, delayMs]);
			};

			await waitForNpmAvailability('1.2.3', {
				maxAttempts: 3,
				initialDelayMs: 100,
				onRetry,
			});

			// onRetry is called before each retry (not the initial check)
			expect(retryArgs.length).toBe(2);
			// First retry: attempt 1, delay 100
			expect(retryArgs[0]).toEqual([1, 100]);
			// Second retry: attempt 2, delay 150 (100 * 1.5)
			expect(retryArgs[1]).toEqual([2, 150]);
		});

		test('uses exponential backoff with max delay cap', async () => {
			mockFetch(async () => new Response(null, { status: 404 }));

			const delays: number[] = [];
			const onRetry = (_attempt: number, delay: number) => {
				delays.push(delay);
			};

			await waitForNpmAvailability('1.2.3', {
				maxAttempts: 6,
				initialDelayMs: 100,
				maxDelayMs: 200,
				onRetry,
			});

			// Delays should be: 100, 150, 200, 200, 200 (capped at maxDelayMs)
			expect(delays).toEqual([100, 150, 200, 200, 200]);
		});

		test('handles version with v prefix', async () => {
			mockFetch(async () => new Response(null, { status: 200 }));

			const result = await waitForNpmAvailability('v1.2.3');

			expect(result).toBe(true);
		});

		test('uses default options when not provided', async () => {
			let callCount = 0;
			mockFetch(async () => {
				callCount++;
				// Succeed on 6th attempt (max default)
				if (callCount < 6) {
					return new Response(null, { status: 404 });
				}
				return new Response(null, { status: 200 });
			});

			// This test would take too long with real delays, so we just verify the function works
			// In real usage, defaults are: maxAttempts=6, initialDelayMs=2000, maxDelayMs=10000
			const result = await waitForNpmAvailability('1.2.3', {
				initialDelayMs: 1, // Override delay for fast test
			});

			expect(result).toBe(true);
			expect(callCount).toBe(6);
		});
	});

	/**
	 * Simulation tests for GitHub issue #838
	 *
	 * These tests simulate the real-world scenario where:
	 * 1. A new version is released (GitHub release created)
	 * 2. The version endpoint (agentuity.sh) returns the new version
	 * 3. But npm CDN hasn't propagated the package yet
	 * 4. User runs `agentuity upgrade` and sees the new version
	 * 5. Without the fix: bun install fails with "No version matching X found"
	 * 6. With the fix: CLI waits for npm availability or shows friendly message
	 */
	describe('GitHub issue #838 simulation', () => {
		test('simulates npm CDN propagation delay - version becomes available after 3 retries', async () => {
			// Simulate: npm CDN takes ~6 seconds to propagate (3 retries * 2s delay)
			let attemptCount = 0;
			const propagationDelay = 3; // Version becomes available on 4th check

			mockFetch(async () => {
				attemptCount++;
				// Simulate CDN propagation: 404 for first 3 attempts, then 200
				if (attemptCount <= propagationDelay) {
					return new Response(null, { status: 404 });
				}
				return new Response(null, { status: 200 });
			});

			const retryLog: string[] = [];
			const result = await waitForNpmAvailability('v0.1.43', {
				maxAttempts: 6,
				initialDelayMs: 10, // Fast for testing
				onRetry: (attempt, delayMs) => {
					retryLog.push(`Retry ${attempt}: waiting ${delayMs}ms`);
				},
			});

			// Should succeed after CDN propagates
			expect(result).toBe(true);
			expect(attemptCount).toBe(4); // 1 initial + 3 retries
			expect(retryLog.length).toBe(3); // 3 retry callbacks
		});

		test('simulates npm CDN never propagates within timeout - shows friendly message scenario', async () => {
			// Simulate: npm CDN never propagates (always returns 404)
			let attemptCount = 0;

			mockFetch(async () => {
				attemptCount++;
				// Always return 404 - simulating permanent unavailability
				return new Response(null, { status: 404 });
			});

			const result = await waitForNpmAvailability('v0.1.43', {
				maxAttempts: 6,
				initialDelayMs: 10,
			});

			// Should return false after all attempts exhausted
			expect(result).toBe(false);
			expect(attemptCount).toBe(6); // All 6 attempts made

			// In the real CLI, this would trigger:
			// tui.warning('The new version is not yet available on npm.');
			// tui.info('This can happen right after a release. Please try again in a few minutes.');
		});

		test('simulates version check in auto-upgrade flow (version-check.ts) - uses quick check', async () => {
			// In the auto-upgrade flow, we use a quick check with short timeout (1s)
			// This avoids blocking the user's command if npm is slow or version not yet available

			const mockedFetch = mockFetch(async () => new Response(null, { status: 404 }));

			// Quick check - short timeout, no retries (simulating version-check.ts behavior)
			const startTime = Date.now();
			const isAvailable = await isVersionAvailableOnNpmQuick('v0.1.43');
			const elapsed = Date.now() - startTime;

			expect(isAvailable).toBe(false);
			expect(mockedFetch).toHaveBeenCalledTimes(1);
			// Should be fast - no retries, no backoff (just mock response time)
			expect(elapsed).toBeLessThan(TIMING.FAST_OPERATION_MS);

			// In the real CLI (version-check.ts), this would:
			// logger.debug('Version %s not yet available on npm, skipping upgrade prompt', latestVersion);
			// return; // Continue with user's original command without delay
		});

		test('simulates auto-upgrade flow with slow npm - does not block user command', async () => {
			// Simulate npm registry being slow (but eventually responds)
			mockFetch(async (_url: string, init?: RequestInit) => {
				// Return a promise that respects the abort signal
				return new Promise<Response>((resolve, reject) => {
					const timeoutId = setTimeout(() => {
						resolve(new Response(null, { status: 200 }));
					}, TIMING.SLOW_RESPONSE_MS);

					// Listen for abort
					if (init?.signal) {
						init.signal.addEventListener('abort', () => {
							clearTimeout(timeoutId);
							reject(new DOMException('Aborted', 'AbortError'));
						});
					}
				});
			});

			const startTime = Date.now();
			const isAvailable = await isVersionAvailableOnNpmQuick('v0.1.43');
			const elapsed = Date.now() - startTime;

			// Should timeout and return false, not wait for the slow response
			expect(isAvailable).toBe(false);
			// Should timeout around 1 second, not block for the full slow response time
			expect(elapsed).toBeLessThan(TIMING.QUICK_TIMEOUT_UPPER_MS);
			expect(elapsed).toBeGreaterThan(TIMING.QUICK_TIMEOUT_LOWER_MS);
		});

		test('simulates immediate availability - no delay needed', async () => {
			// Best case: npm CDN already has the version
			const mockedFetch = mockFetch(async () => new Response(null, { status: 200 }));

			const startTime = Date.now();
			const result = await waitForNpmAvailability('v0.1.43', {
				maxAttempts: 6,
				initialDelayMs: 1000, // Would be slow if we had to retry
			});
			const elapsed = Date.now() - startTime;

			expect(result).toBe(true);
			expect(mockedFetch).toHaveBeenCalledTimes(1);
			// Should be fast - no retries needed (just mock response time)
			expect(elapsed).toBeLessThan(TIMING.FAST_OPERATION_MS);
		});

		test('simulates network error during check - graceful degradation', async () => {
			// Simulate: network is flaky, fetch throws errors
			let attemptCount = 0;

			mockFetch(async () => {
				attemptCount++;
				if (attemptCount <= 2) {
					// First 2 attempts: network error
					throw new Error('ECONNREFUSED');
				}
				// 3rd attempt: success
				return new Response(null, { status: 200 });
			});

			const result = await waitForNpmAvailability('v0.1.43', {
				maxAttempts: 6,
				initialDelayMs: 10,
			});

			// Should succeed after network recovers
			expect(result).toBe(true);
			expect(attemptCount).toBe(3);
		});

		test('simulates the exact error from issue #838', async () => {
			/**
			 * Original error from issue:
			 * error: No version matching "0.1.43" found for specifier "@agentuity/cli" (but package exists)
			 * error: @agentuity/cli@0.1.43 failed to resolve
			 *
			 * This happens when bun tries to install a version that npm CDN doesn't have yet.
			 * Our fix prevents this by checking npm availability BEFORE attempting install.
			 */

			// Simulate the scenario: version announced but not on npm
			mockFetch(async () => new Response(null, { status: 404 }));

			// Check availability (what our fix does)
			const isAvailable = await isVersionAvailableOnNpm('0.1.43');

			// Our fix detects this BEFORE attempting bun install
			expect(isAvailable).toBe(false);

			// Without our fix, the CLI would have run:
			// await $`bun add -g @agentuity/cli@0.1.43`.quiet()
			// Which would fail with the error from issue #838

			// With our fix, the CLI shows a friendly message instead:
			// "The new version is not yet available on npm."
			// "This can happen right after a release. Please try again in a few minutes."
		});

		test('simulates realistic timing with multiple retries', async () => {
			// Track timing to verify exponential backoff behavior
			// We verify relative ordering rather than exact timing for CI stability
			let attemptCount = 0;
			const attemptTimes: number[] = [];
			const startTime = Date.now();

			mockFetch(async () => {
				attemptCount++;
				attemptTimes.push(Date.now() - startTime);
				// Succeed on 4th attempt
				if (attemptCount < 4) {
					return new Response(null, { status: 404 });
				}
				return new Response(null, { status: 200 });
			});

			const result = await waitForNpmAvailability('v0.1.43', {
				maxAttempts: 6,
				initialDelayMs: 50, // 50ms for testing
				maxDelayMs: 150,
			});

			expect(result).toBe(true);
			expect(attemptCount).toBe(4);

			// Verify relative ordering: each attempt should be later than the previous
			// This is more stable than checking exact timing thresholds
			expect(attemptTimes[1]).toBeGreaterThan(attemptTimes[0]); // 2nd after 1st
			expect(attemptTimes[2]).toBeGreaterThan(attemptTimes[1]); // 3rd after 2nd
			expect(attemptTimes[3]).toBeGreaterThan(attemptTimes[2]); // 4th after 3rd

			// Verify delays are increasing (exponential backoff)
			const delay1 = attemptTimes[1] - attemptTimes[0];
			const delay2 = attemptTimes[2] - attemptTimes[1];
			const delay3 = attemptTimes[3] - attemptTimes[2];
			expect(delay2).toBeGreaterThanOrEqual(delay1); // Delays should increase or stay same (capped)
			expect(delay3).toBeGreaterThanOrEqual(delay1); // Later delays >= initial delay
		});
	});
});
