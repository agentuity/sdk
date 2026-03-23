import { mock } from 'bun:test';

/**
 * Type for a function that returns a Response
 */
export type MockFetchFn = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * Helper to mock globalThis.fetch for testing
 *
 * Handles Bun's mock type incompatibility with fetch by using `as any` cast.
 *
 * @param fn Mock implementation that returns a Response
 * @returns The mocked fetch function
 *
 * @example
 * ```ts
 * mockFetch(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
 *
 * // Now fetch calls will use the mock
 * await fetch('https://api.example.com');
 *
 * // Can verify calls
 * expect((globalThis.fetch as any)).toHaveBeenCalled();
 * ```
 */
export function mockFetch(fn: MockFetchFn): ReturnType<typeof mock<typeof fetch>> {
	(globalThis.fetch as any) = mock(fn);
	return globalThis.fetch as any;
}
