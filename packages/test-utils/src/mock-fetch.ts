import { mock, onTestFinished } from 'bun:test';

/**
 * Type for a function that returns a Response
 */
export type MockFetchFn = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * The real `fetch` captured at module load, before any test installs a
 * mock. Restored automatically when the calling test finishes so leaks
 * cannot bleed between test files.
 */
const REAL_FETCH = globalThis.fetch;

/**
 * Helper to mock globalThis.fetch for testing.
 *
 * Installs the mock for the lifetime of the calling test only — the
 * original fetch is restored automatically via `onTestFinished` so
 * other test files (or later tests in the same file) cannot pick up a
 * leaked mock.
 *
 * @param fn Mock implementation that returns a Response
 * @returns The mocked fetch function (so callers can assert on it)
 *
 * @example
 * ```ts
 * mockFetch(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
 *
 * // Now fetch calls inside this test use the mock
 * await fetch('https://api.example.com');
 *
 * // Can verify calls
 * expect((globalThis.fetch as any)).toHaveBeenCalled();
 * ```
 */
export function mockFetch(fn: MockFetchFn): ReturnType<typeof mock<typeof fetch>> {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(globalThis.fetch as any) = mock(fn);
	onTestFinished(() => {
		globalThis.fetch = REAL_FETCH;
	});
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return globalThis.fetch as any;
}

/**
 * Restore the real (non-mocked) `globalThis.fetch`. Useful when a test
 * needs to hit a real network or local server after another test in
 * the same file installed a mock.
 */
export function restoreFetch(): void {
	globalThis.fetch = REAL_FETCH;
}
