import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { createClient } from '../src/client/index';

describe('Client auth integration', () => {
	let originalFetch: typeof globalThis.fetch;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	describe('static headers', () => {
		test('should include static headers in requests', async () => {
			let capturedHeaders: HeadersInit | undefined;

			globalThis.fetch = async (url, init) => {
				capturedHeaders = init?.headers;
				return new Response(JSON.stringify({ success: true }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				});
			};

			interface TestRegistry {
				hello: {
					post: {
						input: { name: string };
						output: { message: string };
						type: 'api';
					};
				};
			}

			const client = createClient<TestRegistry>({
				baseUrl: 'http://localhost:3000',
				headers: { 'X-Custom-Header': 'test-value' },
			});

			await client.hello.post({ name: 'World' });

			expect(capturedHeaders).toBeDefined();
			const headers = capturedHeaders as Record<string, string>;
			expect(headers['X-Custom-Header']).toBe('test-value');
			expect(headers['Content-Type']).toBe('application/json');
		});
	});

	describe('function-based headers', () => {
		test('should call headers function for each request', async () => {
			let callCount = 0;
			let capturedHeaders: HeadersInit | undefined;

			const headersFunc = () => {
				callCount++;
				return { 'X-Request-Count': `${callCount}` };
			};

			globalThis.fetch = async (url, init) => {
				capturedHeaders = init?.headers;
				return new Response(JSON.stringify({ success: true }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				});
			};

			interface TestRegistry {
				hello: {
					post: {
						input: { name: string };
						output: { message: string };
						type: 'api';
					};
				};
			}

			const client = createClient<TestRegistry>({
				baseUrl: 'http://localhost:3000',
				headers: headersFunc,
			});

			// First request
			await client.hello.post({ name: 'Request1' });
			expect(callCount).toBe(1);
			let headers = capturedHeaders as Record<string, string>;
			expect(headers['X-Request-Count']).toBe('1');

			// Second request
			await client.hello.post({ name: 'Request2' });
			expect(callCount).toBe(2);
			headers = capturedHeaders as Record<string, string>;
			expect(headers['X-Request-Count']).toBe('2');
		});

		test('should get fresh auth token per request', async () => {
			let authToken: string | null = 'token1';
			let capturedHeaders: HeadersInit | undefined;

			const headersFunc = () => {
				if (authToken) {
					return { Authorization: `Bearer ${authToken}` };
				}
				return {};
			};

			globalThis.fetch = async (url, init) => {
				capturedHeaders = init?.headers;
				return new Response(JSON.stringify({ success: true }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				});
			};

			interface TestRegistry {
				hello: {
					post: {
						input: { name: string };
						output: { message: string };
						type: 'api';
					};
				};
			}

			const client = createClient<TestRegistry>({
				baseUrl: 'http://localhost:3000',
				headers: headersFunc,
			});

			// Request with token1
			await client.hello.post({ name: 'Request1' });
			let headers = capturedHeaders as Record<string, string>;
			expect(headers['Authorization']).toBe('Bearer token1');

			// Change token
			authToken = 'token2';

			// Request with token2
			await client.hello.post({ name: 'Request2' });
			headers = capturedHeaders as Record<string, string>;
			expect(headers['Authorization']).toBe('Bearer token2');

			// Remove token
			authToken = null;

			// Request without auth
			await client.hello.post({ name: 'Request3' });
			headers = capturedHeaders as Record<string, string>;
			expect(headers['Authorization']).toBeUndefined();
		});
	});

	describe('type safety', () => {
		test('client should maintain full type inference with headers function', async () => {
			globalThis.fetch = async () => {
				return new Response(JSON.stringify({ message: 'Hello, World!' }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				});
			};

			interface TestRegistry {
				hello: {
					post: {
						input: { name: string };
						output: { message: string };
						type: 'api';
					};
				};
			}

			const client = createClient<TestRegistry>({
				headers: () => ({ Authorization: 'Bearer test' }),
			});

			// TypeScript should infer the correct input/output types
			const result = await client.hello.post({ name: 'World' });

			// This should be type-safe
			expect(result.message).toBe('Hello, World!');

			// @ts-expect-error - should error because 'invalidProp' doesn't exist
			const _invalid = result.invalidProp;
		});
	});
});
