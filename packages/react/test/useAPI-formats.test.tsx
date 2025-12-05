import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import { renderHook, waitFor, act } from '@testing-library/react';
import React from 'react';
import { AgentuityProvider } from '../src/context';
import { useAPI } from '../src/api';

// Extend RouteRegistry for testing
declare module '../src/types' {
	interface RouteRegistry {
		'GET /test': {
			inputSchema: never;
			outputSchema: { message: string };
		};
		'POST /test': {
			inputSchema: { name: string };
			outputSchema: { id: string; name: string };
		};
	}
}

// Mock fetch
const originalFetch = globalThis.fetch;
let fetchMock: typeof fetch;

beforeAll(() => {
	fetchMock = async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
		const method = init?.method || 'GET';

		if (method === 'GET' && url.includes('/test')) {
			return new Response(JSON.stringify({ message: 'Hello from GET' }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			});
		}

		if (method === 'POST' && url.includes('/test')) {
			const body = init?.body ? JSON.parse(init.body as string) : {};
			return new Response(JSON.stringify({ id: '123', name: body.name }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			});
		}

		return new Response('Not Found', { status: 404 });
	};
	globalThis.fetch = fetchMock as typeof fetch;
});

afterAll(() => {
	globalThis.fetch = originalFetch;
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
	<AgentuityProvider baseUrl="http://localhost:3000">{children}</AgentuityProvider>
);

describe('useAPI - Input Formats', () => {
	test('should work with string format', async () => {
		const { result } = renderHook(() => useAPI('GET /test'), { wrapper });

		await waitFor(() => expect(result.current.isSuccess).toBe(true));

		expect(result.current.data).toEqual({ message: 'Hello from GET' });
		expect(result.current.error).toBeNull();
	});

	test('should work with route property', async () => {
		const { result } = renderHook(() => useAPI({ route: 'GET /test' }), { wrapper });

		await waitFor(() => expect(result.current.isSuccess).toBe(true));

		expect(result.current.data).toEqual({ message: 'Hello from GET' });
		expect(result.current.error).toBeNull();
	});

	test('should work with method and path properties', async () => {
		const { result } = renderHook(() => useAPI({ method: 'GET', path: '/test' }), { wrapper });

		await waitFor(() => expect(result.current.isSuccess).toBe(true));

		expect(result.current.data).toEqual({ message: 'Hello from GET' });
		expect(result.current.error).toBeNull();
	});

	test('should work with POST using method and path', async () => {
		const { result } = renderHook(() => useAPI({ method: 'POST', path: '/test' }), { wrapper });

		expect(result.current.data).toBeUndefined();

		await act(async () => {
			await result.current.invoke({ name: 'Alice' });
		});

		expect(result.current.isSuccess).toBe(true);
		expect(result.current.data).toEqual({ id: '123', name: 'Alice' });
	});

	test('should work with POST using route property', async () => {
		const { result } = renderHook(() => useAPI({ route: 'POST /test' }), { wrapper });

		expect(result.current.data).toBeUndefined();

		await act(async () => {
			await result.current.invoke({ name: 'Bob' });
		});

		expect(result.current.isSuccess).toBe(true);
		expect(result.current.data).toEqual({ id: '123', name: 'Bob' });
	});

	test('should work with POST using string format', async () => {
		const { result } = renderHook(() => useAPI('POST /test'), { wrapper });

		expect(result.current.data).toBeUndefined();

		await act(async () => {
			await result.current.invoke({ name: 'Charlie' });
		});

		expect(result.current.isSuccess).toBe(true);
		expect(result.current.data).toEqual({ id: '123', name: 'Charlie' });
	});
});
