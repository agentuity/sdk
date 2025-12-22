import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import { renderHook, waitFor, act } from '@testing-library/react';
import React from 'react';
import { s } from '@agentuity/schema';
import { mockFetch } from '@agentuity/test-utils';
import { AgentuityProvider } from '../src/context';
import { useAPI } from '../src/api';

// Define schemas for testing
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const getTestOutput = s.object({ message: s.string() });
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const postTestInput = s.object({ name: s.string() });
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const postTestOutput = s.object({ id: s.string(), name: s.string() });

// Extend RouteRegistry for testing
declare module '../src/types' {
	interface RouteRegistry {
		'GET /test': {
			inputSchema: never;
			outputSchema: typeof getTestOutput;
		};
		'POST /test': {
			inputSchema: typeof postTestInput;
			outputSchema: typeof postTestOutput;
		};
	}
}

// Mock fetch
const originalFetch = globalThis.fetch;

beforeAll(() => {
	mockFetch(async (url, init) => {
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
	});
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
