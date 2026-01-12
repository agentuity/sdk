/**
 * Test helper utilities for the integration suite
 */

/**
 * Generate a unique ID for test isolation
 * Includes a run ID to ensure uniqueness across different test runs
 */
let idCounter = 0;
const runId = Math.random().toString(36).substring(2, 10);

export function uniqueId(prefix = 'test'): string {
	const timestamp = Date.now();
	const random = Math.random().toString(36).substring(2, 15);
	const counter = (idCounter++).toString(36);
	// Use underscores instead of hyphens for valid env var names
	return `${prefix}_${runId}_${timestamp}_${counter}_${random}`;
}

/**
 * Assertion utility that throws on failure
 */
export function assert(condition: boolean, message: string): asserts condition {
	if (!condition) {
		throw new Error(`Assertion failed: ${message}`);
	}
}

/**
 * Assert equality
 */
export function assertEqual<T>(actual: T, expected: T, message?: string): void {
	const msg = message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`;
	assert(actual === expected, msg);
}

/**
 * Assert deep equality for objects
 */
export function assertDeepEqual<T>(actual: T, expected: T, message?: string): void {
	const msg = message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`;
	assert(JSON.stringify(actual) === JSON.stringify(expected), msg);
}

/**
 * Assert that a value is defined (not null/undefined)
 */
export function assertDefined<T>(
	value: T | null | undefined,
	message?: string
): asserts value is T {
	const msg = message || `Expected value to be defined, got ${value}`;
	assert(value !== null && value !== undefined, msg);
}

/**
 * Assert that a value is truthy
 */
export function assertTruthy(value: unknown, message?: string): void {
	const msg = message || `Expected truthy value, got ${value}`;
	assert(!!value, msg);
}

/**
 * Assert that a value is falsy
 */
export function assertFalsy(value: unknown, message?: string): void {
	const msg = message || `Expected falsy value, got ${value}`;
	assert(!value, msg);
}

/**
 * Assert that a function throws an error
 */
export async function assertThrows(
	fn: () => void | Promise<void>,
	message?: string
): Promise<void> {
	let didThrow = false;
	try {
		await fn();
	} catch {
		didThrow = true;
	}
	const msg = message || 'Expected function to throw an error';
	assert(didThrow, msg);
}

/**
 * Sleep for a given number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create a cleanup function that tracks resources
 */
export class CleanupTracker {
	private cleanupFns: Array<() => void | Promise<void>> = [];

	add(fn: () => void | Promise<void>): void {
		this.cleanupFns.push(fn);
	}

	async cleanup(): Promise<void> {
		for (const fn of this.cleanupFns.reverse()) {
			try {
				await fn();
			} catch (error) {
				console.error('Cleanup error:', error);
			}
		}
		this.cleanupFns = [];
	}
}
