import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { AgentuityProvider } from '../src/context';
import { createClient, setGlobalAuthHeader, getGlobalAuthHeader } from '../src/client';

// Test metadata for all tests
const testMetadata = {
	hello: {
		post: { type: 'api' },
	},
};

describe('React client auth integration', () => {
	let originalFetch: typeof globalThis.fetch;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
		// Reset global auth header
		setGlobalAuthHeader(null);
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		setGlobalAuthHeader(null);
	});

	describe('auth header injection', () => {
		test('should inject auth header from global state', async () => {
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

			// Set global auth header
			setGlobalAuthHeader('Bearer test-token');

			const metadata = {
				hello: {
					post: { type: 'api' },
				},
			};

			const client = createClient<TestRegistry>({}, metadata);

			await client.hello.post({ name: 'World' });

			expect(capturedHeaders).toBeDefined();
			const headers = capturedHeaders as Record<string, string>;
			expect(headers['Authorization']).toBe('Bearer test-token');
		});

		test('should not inject Authorization header when no auth is set', async () => {
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

			const client = createClient<TestRegistry>({}, testMetadata);

			await client.hello.post({ name: 'World' });

			expect(capturedHeaders).toBeDefined();
			const headers = capturedHeaders as Record<string, string>;
			expect(headers['Authorization']).toBeUndefined();
		});

		test('should merge user headers with auth headers', async () => {
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

			setGlobalAuthHeader('Bearer test-token');

			const client = createClient<TestRegistry>(
				{
					headers: { 'X-Custom-Header': 'custom-value' },
				},
				testMetadata
			);

			await client.hello.post({ name: 'World' });

			expect(capturedHeaders).toBeDefined();
			const headers = capturedHeaders as Record<string, string>;
			expect(headers['Authorization']).toBe('Bearer test-token');
			expect(headers['X-Custom-Header']).toBe('custom-value');
		});

		test('should allow user headers function to override auth', async () => {
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

			setGlobalAuthHeader('Bearer old-token');

			const client = createClient<TestRegistry>(
				{
					headers: () => ({ Authorization: 'Bearer override-token' }),
				},
				testMetadata
			);

			await client.hello.post({ name: 'World' });

			expect(capturedHeaders).toBeDefined();
			const headers = capturedHeaders as Record<string, string>;
			// User headers override global auth header
			expect(headers['Authorization']).toBe('Bearer override-token');
		});
	});

	describe('AgentuityProvider integration', () => {
		test('should sync auth header from provider to global state', async () => {
			const TestComponent = () => {
				return <div>Test</div>;
			};

			// Render with auth header prop
			render(
				<AgentuityProvider baseUrl="http://localhost:3000" authHeader="Bearer provider-token">
					<TestComponent />
				</AgentuityProvider>
			);

			// Provider syncs authHeader prop to global state via useEffect
			// In happy-dom, effects run synchronously, so we can check immediately
			await waitFor(
				() => {
					expect(getGlobalAuthHeader()).toBe('Bearer provider-token');
				},
				{ timeout: 100 }
			);
		});
	});

	describe('dynamic auth updates', () => {
		test('should use latest auth token for each request', async () => {
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

			const client = createClient<TestRegistry>({}, testMetadata);

			// First request without auth
			await client.hello.post({ name: 'Request1' });
			let headers = capturedHeaders as Record<string, string>;
			expect(headers['Authorization']).toBeUndefined();

			// Set auth token
			setGlobalAuthHeader('Bearer token1');

			// Second request with token1
			await client.hello.post({ name: 'Request2' });
			headers = capturedHeaders as Record<string, string>;
			expect(headers['Authorization']).toBe('Bearer token1');

			// Update token
			setGlobalAuthHeader('Bearer token2');

			// Third request with token2
			await client.hello.post({ name: 'Request3' });
			headers = capturedHeaders as Record<string, string>;
			expect(headers['Authorization']).toBe('Bearer token2');

			// Remove auth
			setGlobalAuthHeader(null);

			// Fourth request without auth
			await client.hello.post({ name: 'Request4' });
			headers = capturedHeaders as Record<string, string>;
			expect(headers['Authorization']).toBeUndefined();
		});
	});
});
