import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { s } from '@agentuity/schema';
import { mockFetch } from '@agentuity/test-utils';
import { AgentuityProvider } from '../src/context';
import { useAPI } from '../src/api';

// Define schemas for testing
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const userOutput = s.object({ userId: s.string(), name: s.string() });
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const memberOutput = s.object({ orgId: s.string(), memberId: s.string() });
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const searchOutput = s.object({ query: s.string(), limit: s.number() });

// Extend RouteRegistry for testing
declare module '../src/types' {
	interface RouteRegistry {
		'GET /users/:userId': {
			inputSchema: never;
			outputSchema: typeof userOutput;
			params: { userId: string };
		};
		'GET /organizations/:orgId/members/:memberId': {
			inputSchema: never;
			outputSchema: typeof memberOutput;
			params: { orgId: string; memberId: string };
		};
		'GET /search': {
			inputSchema: never;
			outputSchema: typeof searchOutput;
			params: never;
		};
	}
}

// Capture the URL from fetch calls
let capturedUrl: string | undefined;

// Mock fetch
const originalFetch = globalThis.fetch;

beforeAll(() => {
	mockFetch(async (url, _init) => {
		capturedUrl = url instanceof Request ? url.url : url.toString();

		if (url.includes('/users/')) {
			const userId = url.split('/users/')[1]?.split('?')[0];
			return new Response(JSON.stringify({ userId, name: `User ${userId}` }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			});
		}

		if (url.includes('/organizations/') && url.includes('/members/')) {
			const parts = url.match(/\/organizations\/([^/]+)\/members\/([^/?]+)/);
			return new Response(JSON.stringify({ orgId: parts?.[1], memberId: parts?.[2] }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			});
		}

		if (url.includes('/search')) {
			const urlObj = new URL(url);
			const query = urlObj.searchParams.get('q') || '';
			const limit = parseInt(urlObj.searchParams.get('limit') || '10');
			return new Response(JSON.stringify({ query, limit }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			});
		}

		return new Response('Not Found', { status: 404 });
	});
});

afterAll(() => {
	globalThis.fetch = originalFetch;
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
	<AgentuityProvider baseUrl="http://localhost:3000">{children}</AgentuityProvider>
);

describe('useAPI - Path Params', () => {
	test('should substitute single path parameter', async () => {
		const { result } = renderHook(
			() =>
				useAPI({
					route: 'GET /users/:userId',
					params: { userId: '123' },
				}),
			{ wrapper }
		);

		await waitFor(() => expect(result.current.isSuccess).toBe(true));

		expect(capturedUrl).toBe('http://localhost:3000/users/123');
		expect(result.current.data).toEqual({ userId: '123', name: 'User 123' });
	});

	test('should substitute multiple path parameters', async () => {
		const { result } = renderHook(
			() =>
				useAPI({
					route: 'GET /organizations/:orgId/members/:memberId',
					params: { orgId: 'org-456', memberId: 'user-789' },
				}),
			{ wrapper }
		);

		await waitFor(() => expect(result.current.isSuccess).toBe(true));

		expect(capturedUrl).toBe('http://localhost:3000/organizations/org-456/members/user-789');
		expect(result.current.data).toEqual({
			orgId: 'org-456',
			memberId: 'user-789',
		});
	});

	test('should URL-encode path parameter values', async () => {
		const { result } = renderHook(
			() =>
				useAPI({
					route: 'GET /users/:userId',
					params: { userId: 'user/with/slashes' },
				}),
			{ wrapper }
		);

		await waitFor(() => expect(result.current.isSuccess).toBe(true));

		expect(capturedUrl).toBe('http://localhost:3000/users/user%2Fwith%2Fslashes');
	});
});

describe('useAPI - Query Params', () => {
	test('should append query parameters to URL', async () => {
		const { result } = renderHook(
			() =>
				useAPI({
					route: 'GET /search',
					query: { q: 'test', limit: '5' },
				}),
			{ wrapper }
		);

		await waitFor(() => expect(result.current.isSuccess).toBe(true));

		expect(capturedUrl).toContain('/search?');
		expect(capturedUrl).toContain('q=test');
		expect(capturedUrl).toContain('limit=5');
		expect(result.current.data).toEqual({ query: 'test', limit: 5 });
	});

	test('should work with URLSearchParams', async () => {
		const params = new URLSearchParams();
		params.set('q', 'hello world');
		params.set('limit', '20');

		const { result } = renderHook(
			() =>
				useAPI({
					route: 'GET /search',
					query: params,
				}),
			{ wrapper }
		);

		await waitFor(() => expect(result.current.isSuccess).toBe(true));

		expect(capturedUrl).toContain('q=hello+world');
		expect(capturedUrl).toContain('limit=20');
	});
});
