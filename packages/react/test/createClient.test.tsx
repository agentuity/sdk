import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { setGlobalBaseUrl, getGlobalBaseUrl, createClient, createAPIClient } from '../src/client';

describe('React createClient', () => {
	describe('Global baseUrl helpers', () => {
		test('should set and get global baseUrl', () => {
			setGlobalBaseUrl('https://test.example.com');
			expect(getGlobalBaseUrl()).toBe('https://test.example.com');
		});

		test('should fallback to window.location.origin when not set', () => {
			setGlobalBaseUrl('');
			const result = getGlobalBaseUrl();
			expect(result).toBeDefined();
		});

		test('should update when set multiple times', () => {
			setGlobalBaseUrl('https://v1.example.com');
			expect(getGlobalBaseUrl()).toBe('https://v1.example.com');

			setGlobalBaseUrl('https://v2.example.com');
			expect(getGlobalBaseUrl()).toBe('https://v2.example.com');
		});
	});

	describe('RPC client - routes without path params', () => {
		let originalFetch: typeof globalThis.fetch;
		let capturedUrl: string | undefined;

		beforeEach(() => {
			originalFetch = globalThis.fetch;
			setGlobalBaseUrl('http://localhost:3000');
		});

		afterEach(() => {
			globalThis.fetch = originalFetch;
		});

		test('createClient should work with routes that have no params', async () => {
			globalThis.fetch = async (url) => {
				capturedUrl = url instanceof Request ? url.url : url.toString();
				return new Response(JSON.stringify({ status: 'ok' }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				});
			};

			interface TestRegistry {
				health: {
					get: {
						input: never;
						output: { status: string };
						type: 'api';
						params: never;
						paramsTuple: [];
					};
				};
			}

			const metadata = {
				health: {
					get: { type: 'api', path: '/api/health' },
				},
			};

			const client = createClient<TestRegistry>({}, metadata);

			// Should work without any arguments - no params needed
			const result = await client.health.get();

			expect(capturedUrl).toBe('http://localhost:3000/api/health');
			expect(result).toEqual({ status: 'ok' });
		});

		test('createClient should work with POST routes that have no path params but have input', async () => {
			let capturedBody: string | undefined;

			globalThis.fetch = async (url, init) => {
				capturedUrl = url instanceof Request ? url.url : url.toString();
				capturedBody = init?.body as string;
				return new Response(JSON.stringify({ greeting: 'Hello World!' }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				});
			};

			interface TestRegistry {
				hello: {
					post: {
						input: { name: string };
						output: { greeting: string };
						type: 'api';
						params: never;
						paramsTuple: [];
					};
				};
			}

			const metadata = {
				hello: {
					post: { type: 'api', path: '/api/hello' },
				},
			};

			const client = createClient<TestRegistry>({}, metadata);

			// Should accept input directly without any path params
			const result = await client.hello.post({ name: 'World' });

			expect(capturedUrl).toBe('http://localhost:3000/api/hello');
			expect(capturedBody).toBe('{"name":"World"}');
			expect(result).toEqual({ greeting: 'Hello World!' });
		});

		test('createClient should work with query params but no path params', async () => {
			globalThis.fetch = async (url) => {
				capturedUrl = url instanceof Request ? url.url : url.toString();
				return new Response(JSON.stringify({ results: ['a', 'b'] }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				});
			};

			interface TestRegistry {
				search: {
					get: {
						input: never;
						output: { results: string[] };
						type: 'api';
						params: never;
						paramsTuple: [];
					};
				};
			}

			const metadata = {
				search: {
					get: { type: 'api', path: '/api/search' },
				},
			};

			const client = createClient<TestRegistry>({}, metadata);

			// Should work with query params only - no path params needed
			const result = await client.search.get({ query: { q: 'test' } });

			expect(capturedUrl).toBe('http://localhost:3000/api/search?q=test');
			expect(result).toEqual({ results: ['a', 'b'] });
		});

		test('createAPIClient should work with routes that have no params', async () => {
			globalThis.fetch = async (url) => {
				capturedUrl = url instanceof Request ? url.url : url.toString();
				return new Response(JSON.stringify({ version: '1.0.0' }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				});
			};

			// Set up global metadata (simulating what generated code does)
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			(globalThis as any).__rpcRouteMetadata = {
				version: {
					get: { type: 'api', path: '/api/version' },
				},
			};

			interface TestRegistry {
				version: {
					get: {
						input: never;
						output: { version: string };
						type: 'api';
						params: never;
						paramsTuple: [];
					};
				};
			}

			const api = createAPIClient<TestRegistry>();

			// Should work without any arguments
			const result = await api.version.get();

			expect(capturedUrl).toBe('http://localhost:3000/api/version');
			expect(result).toEqual({ version: '1.0.0' });

			// Clean up
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			delete (globalThis as any).__rpcRouteMetadata;
		});
	});
});
