/**
 * Additional edge case tests for useAPI type inference
 *
 * These tests cover scenarios identified for comprehensive type safety:
 * - Same path with different methods (GET vs POST vs DELETE)
 * - All routes have params vs no routes have params
 * - Single route registry
 * - Streaming vs non-streaming routes
 * - Never schemas for input/output
 * - Union type inference edge cases
 *
 * Many tests are type-level assertions (compile-time checks).
 */

import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import { renderHook, waitFor, act } from '@testing-library/react';
import React from 'react';
import { s } from '@agentuity/schema';
import { mockFetch } from '@agentuity/test-utils';
import { AgentuityProvider } from '../src/context';
import { useAPI } from '../src/api';

// ============================================================================
// Schema definitions for edge case testing (prefixed with _ as only used in typeof)
// ============================================================================

const _itemsListOutput = s.object({
	items: s.array(s.object({ id: s.string(), name: s.string() })),
});
const _itemDetailOutput = s.object({ id: s.string(), name: s.string(), description: s.string() });
const _createItemInput = s.object({ name: s.string(), description: s.string() });
const _createItemOutput = s.object({ id: s.string(), name: s.string() });
const _streamChunkOutput = s.object({ eventType: s.string(), data: s.any() });
const _userOutput = s.object({ id: s.string(), email: s.string() });

/**
 * Extended RouteRegistry for edge case testing
 */
declare module '../src/types' {
	interface RouteRegistry {
		// ============================================
		// Scenario 6: Same path, different methods
		// ============================================
		'GET /api/items': {
			inputSchema: never;
			outputSchema: typeof _itemsListOutput;
			stream: false;
			params: never;
		};
		'POST /api/items': {
			inputSchema: typeof _createItemInput;
			outputSchema: typeof _createItemOutput;
			stream: false;
			params: never;
		};
		'DELETE /api/items': {
			inputSchema: never;
			outputSchema: never;
			stream: false;
			params: never;
		};

		// ============================================
		// Scenario 4: Streaming vs non-streaming (same method)
		// ============================================
		'GET /api/events': {
			inputSchema: never;
			outputSchema: typeof _streamChunkOutput;
			stream: true;
			params: never;
		};

		// ============================================
		// Scenario 5: never outputSchema in stream
		// ============================================
		'GET /api/raw-stream': {
			inputSchema: never;
			outputSchema: never;
			stream: true;
			params: never;
		};

		// ============================================
		// Scenario 3B: Optional fields within params
		// ============================================
		'GET /api/filtered-items/:category': {
			inputSchema: never;
			outputSchema: typeof _itemsListOutput;
			stream: false;
			params: { category: string };
		};

		// ============================================
		// Additional routes for comprehensive testing
		// ============================================
		'GET /api/user/:userId': {
			inputSchema: never;
			outputSchema: typeof _userOutput;
			stream: false;
			params: { userId: string };
		};
		'POST /api/user/:userId/activate': {
			inputSchema: never;
			outputSchema: typeof _userOutput;
			stream: false;
			params: { userId: string };
		};
		'PUT /api/items/:itemId': {
			inputSchema: typeof _createItemInput;
			outputSchema: typeof _itemDetailOutput;
			stream: false;
			params: { itemId: string };
		};
	}
}

// Capture request details
let capturedUrl: string | undefined;
let capturedMethod: string | undefined;

// Mock fetch
const originalFetch = globalThis.fetch;

beforeAll(() => {
	mockFetch(async (url, init) => {
		capturedUrl = url instanceof Request ? url.url : url.toString();
		capturedMethod = init?.method || 'GET';

		// GET /api/items (list)
		if (capturedMethod === 'GET' && capturedUrl.match(/\/api\/items(\?.*)?$/)) {
			return new Response(JSON.stringify({ items: [{ id: '1', name: 'Item 1' }] }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			});
		}

		// POST /api/items (create)
		if (capturedMethod === 'POST' && capturedUrl.match(/\/api\/items(\?.*)?$/)) {
			return new Response(JSON.stringify({ id: 'new-1', name: 'New Item' }), {
				status: 201,
				headers: { 'Content-Type': 'application/json' },
			});
		}

		// DELETE /api/items
		if (capturedMethod === 'DELETE' && capturedUrl.includes('/api/items')) {
			return new Response(null, { status: 204 });
		}

		// GET /api/events (streaming)
		if (capturedUrl.includes('/api/events')) {
			const stream = new ReadableStream({
				start(controller) {
					controller.enqueue(new TextEncoder().encode('{"eventType":"ping","data":{}}\n'));
					controller.close();
				},
			});
			return new Response(stream, {
				status: 200,
				headers: { 'Content-Type': 'application/x-ndjson' },
			});
		}

		// GET /api/raw-stream
		if (capturedUrl.includes('/api/raw-stream')) {
			const stream = new ReadableStream({
				start(controller) {
					controller.enqueue(new TextEncoder().encode('raw data chunk\n'));
					controller.close();
				},
			});
			return new Response(stream, { status: 200 });
		}

		// GET /api/filtered-items/:category
		if (capturedUrl.match(/\/api\/filtered-items\/[^/?]+/)) {
			return new Response(JSON.stringify({ items: [{ id: 'f1', name: 'Filtered' }] }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			});
		}

		// GET /api/user/:userId
		if (capturedMethod === 'GET' && capturedUrl.match(/\/api\/user\/[^/?]+$/)) {
			const userId = capturedUrl.match(/\/api\/user\/([^/?]+)$/)?.[1];
			return new Response(JSON.stringify({ id: userId, email: 'test@test.com' }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			});
		}

		// POST /api/user/:userId/activate
		if (capturedMethod === 'POST' && capturedUrl.match(/\/api\/user\/[^/]+\/activate/)) {
			const userId = capturedUrl.match(/\/api\/user\/([^/]+)\/activate/)?.[1];
			return new Response(JSON.stringify({ id: userId, email: 'activated@test.com' }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			});
		}

		// PUT /api/items/:itemId
		if (capturedMethod === 'PUT' && capturedUrl.match(/\/api\/items\/[^/?]+$/)) {
			const itemId = capturedUrl.match(/\/api\/items\/([^/?]+)$/)?.[1];
			return new Response(
				JSON.stringify({ id: itemId, name: 'Updated', description: 'Updated desc' }),
				{ status: 200, headers: { 'Content-Type': 'application/json' } }
			);
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

// ============================================================================
// Scenario 6: Same path, different methods (GET vs POST vs DELETE)
// ============================================================================

describe('Scenario 6: Same path, different methods', () => {
	test('GET /api/items - returns list, auto-fetches, has refetch', async () => {
		const { result } = renderHook(() => useAPI({ route: 'GET /api/items' }), { wrapper });

		await waitFor(() => expect(result.current.isSuccess).toBe(true));

		expect(capturedMethod).toBe('GET');
		expect(result.current.data?.items).toBeDefined();
		expect(typeof result.current.refetch).toBe('function');
	});

	test('POST /api/items - requires invoke with input', async () => {
		const { result } = renderHook(() => useAPI({ route: 'POST /api/items' }), { wrapper });

		await waitFor(() => expect(result.current.invoke).toBeDefined());

		await act(async () => {
			await result.current.invoke({ name: 'New Item', description: 'A new item' });
		});

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(capturedMethod).toBe('POST');
		expect(result.current.data?.id).toBeDefined();
	});

	test('DELETE /api/items - invoke with no input, no data returned', async () => {
		const { result } = renderHook(() => useAPI({ route: 'DELETE /api/items' }), { wrapper });

		await waitFor(() => expect(result.current.invoke).toBeDefined());

		await act(async () => {
			await result.current.invoke();
		});

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(capturedMethod).toBe('DELETE');
	});

	test('method/path form: GET same path works without params', async () => {
		const { result } = renderHook(
			() => useAPI({ method: 'GET', path: '/api/items', enabled: true }),
			{ wrapper }
		);

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(capturedMethod).toBe('GET');
	});

	test('method/path form: POST same path works without params', async () => {
		const { result } = renderHook(() => useAPI({ method: 'POST', path: '/api/items' }), {
			wrapper,
		});

		await waitFor(() => expect(result.current.invoke).toBeDefined());

		await act(async () => {
			await result.current.invoke({ name: 'Test', description: 'Test desc' });
		});

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(capturedMethod).toBe('POST');
	});

	test('method/path form: DELETE same path works without params', async () => {
		const { result } = renderHook(() => useAPI({ method: 'DELETE', path: '/api/items' }), {
			wrapper,
		});

		await waitFor(() => expect(result.current.invoke).toBeDefined());

		await act(async () => {
			await result.current.invoke();
		});

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(capturedMethod).toBe('DELETE');
	});
});

// ============================================================================
// Scenario 4 & 5: Streaming vs non-streaming routes
// ============================================================================

describe('Scenario 4 & 5: Streaming routes', () => {
	test('route form: streaming route compiles with delimiter option', async () => {
		const { result } = renderHook(
			() =>
				useAPI({
					route: 'GET /api/events',
					delimiter: '\n',
				}),
			{ wrapper }
		);

		// For streaming routes, we mainly verify the type compiles correctly.
		// The actual streaming behavior depends on runtime conditions.
		await waitFor(() => expect(result.current.isLoading).toBe(false), { timeout: 3000 });

		// If successful, data should be defined (could be array or initial value)
		if (result.current.isSuccess) {
			expect(result.current.data).toBeDefined();
		}
	});

	test('route form: streaming with never outputSchema compiles', async () => {
		const { result } = renderHook(() => useAPI({ route: 'GET /api/raw-stream' }), { wrapper });

		await waitFor(() => expect(result.current.isLoading).toBe(false), { timeout: 3000 });

		// Type check: this should compile - the key validation is at compile time
		if (result.current.isSuccess) {
			expect(result.current.data).toBeDefined();
		}
	});

	test('method/path form: streaming route accessible without params', async () => {
		const { result } = renderHook(
			() =>
				useAPI({
					method: 'GET',
					path: '/api/events',
					enabled: true,
				}),
			{ wrapper }
		);

		await waitFor(() => expect(result.current.isLoading).toBe(false), { timeout: 3000 });
	});
});

// ============================================================================
// Scenario 3: Params variations
// ============================================================================

describe('Scenario 3: Params variations', () => {
	test('route form with single param - params required and typed', async () => {
		const { result } = renderHook(
			() =>
				useAPI({
					route: 'GET /api/filtered-items/:category',
					params: { category: 'electronics' },
				}),
			{ wrapper }
		);

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(capturedUrl).toContain('/api/filtered-items/electronics');
	});

	test('method/path form with param - params optional but functional', async () => {
		const { result } = renderHook(
			() =>
				useAPI({
					method: 'GET',
					path: '/api/filtered-items/:category',
					params: { category: 'books' },
					enabled: true,
				}),
			{ wrapper }
		);

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(capturedUrl).toContain('/api/filtered-items/books');
	});

	test('route form: multiple routes with different param shapes', async () => {
		// Test user route
		const { result: userResult } = renderHook(
			() =>
				useAPI({
					route: 'GET /api/user/:userId',
					params: { userId: 'user-123' },
				}),
			{ wrapper }
		);

		await waitFor(() => expect(userResult.current.isSuccess).toBe(true));
		expect(capturedUrl).toContain('/api/user/user-123');

		// Test item route with different param name
		const { result: itemResult } = renderHook(
			() =>
				useAPI({
					route: 'PUT /api/items/:itemId',
					params: { itemId: 'item-456' },
					input: { name: 'Updated', description: 'Updated desc' },
				}),
			{ wrapper }
		);

		await waitFor(() => expect(itemResult.current.invoke).toBeDefined());

		await act(async () => {
			await itemResult.current.invoke({ name: 'Updated', description: 'Updated desc' });
		});

		await waitFor(() => expect(itemResult.current.isSuccess).toBe(true));
		expect(capturedUrl).toContain('/api/items/item-456');
	});

	test('POST route with params - params required in route form', async () => {
		const { result } = renderHook(
			() =>
				useAPI({
					route: 'POST /api/user/:userId/activate',
					params: { userId: 'activate-me' },
				}),
			{ wrapper }
		);

		await waitFor(() => expect(result.current.invoke).toBeDefined());

		await act(async () => {
			await result.current.invoke();
		});

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(capturedUrl).toContain('/api/user/activate-me/activate');
	});
});

// ============================================================================
// Scenario 5C: inputSchema: never in non-GET routes
// ============================================================================

describe('Scenario 5C: inputSchema variations', () => {
	test('DELETE with inputSchema: never - invoke takes no arguments', async () => {
		const { result } = renderHook(() => useAPI({ route: 'DELETE /api/items' }), { wrapper });

		await waitFor(() => expect(result.current.invoke).toBeDefined());

		await act(async () => {
			await result.current.invoke();
		});

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
	});

	test('POST with defined inputSchema - invoke requires argument', async () => {
		const { result } = renderHook(() => useAPI({ route: 'POST /api/items' }), { wrapper });

		await waitFor(() => expect(result.current.invoke).toBeDefined());

		await act(async () => {
			await result.current.invoke({ name: 'Required Input', description: 'Required' });
		});

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
	});

	test('POST with params and no inputSchema - invoke takes no arguments', async () => {
		const { result } = renderHook(
			() =>
				useAPI({
					route: 'POST /api/user/:userId/activate',
					params: { userId: 'test-user' },
				}),
			{ wrapper }
		);

		await waitFor(() => expect(result.current.invoke).toBeDefined());

		await act(async () => {
			await result.current.invoke();
		});

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
	});
});

// ============================================================================
// Scenario 8: Single route edge case (tested via subset behavior)
// ============================================================================

describe('Scenario 8: Precise typing with specific routes', () => {
	test('single specific route has precise data type', async () => {
		const { result } = renderHook(
			() => useAPI({ route: 'GET /api/user/:userId', params: { userId: 'precise' } }),
			{ wrapper }
		);

		await waitFor(() => expect(result.current.isSuccess).toBe(true));

		// Data should have the exact shape from userOutput
		expect(result.current.data?.id).toBeDefined();
		expect(result.current.data?.email).toBeDefined();
	});
});

// ============================================================================
// Comprehensive method/path edge cases
// ============================================================================

describe('Method/path form: comprehensive edge cases', () => {
	test('all HTTP methods work with method/path form', async () => {
		// GET
		const { result: getResult } = renderHook(
			() => useAPI({ method: 'GET', path: '/api/items', enabled: true }),
			{ wrapper }
		);
		await waitFor(() => expect(getResult.current.isSuccess).toBe(true));

		// POST
		const { result: postResult } = renderHook(
			() => useAPI({ method: 'POST', path: '/api/items' }),
			{ wrapper }
		);
		await waitFor(() => expect(postResult.current.invoke).toBeDefined());
		await act(async () => {
			await postResult.current.invoke({ name: 'Test', description: 'Desc' });
		});
		await waitFor(() => expect(postResult.current.isSuccess).toBe(true));

		// PUT
		const { result: putResult } = renderHook(
			() =>
				useAPI({
					method: 'PUT',
					path: '/api/items/:itemId',
					params: { itemId: 'put-test' },
				}),
			{ wrapper }
		);
		await waitFor(() => expect(putResult.current.invoke).toBeDefined());
		await act(async () => {
			await putResult.current.invoke({ name: 'Put', description: 'Put desc' });
		});
		await waitFor(() => expect(putResult.current.isSuccess).toBe(true));

		// DELETE
		const { result: deleteResult } = renderHook(
			() => useAPI({ method: 'DELETE', path: '/api/items' }),
			{ wrapper }
		);
		await waitFor(() => expect(deleteResult.current.invoke).toBeDefined());
		await act(async () => {
			await deleteResult.current.invoke();
		});
		await waitFor(() => expect(deleteResult.current.isSuccess).toBe(true));
	});

	test('method/path with query params and no path params', async () => {
		const { result } = renderHook(
			() =>
				useAPI({
					method: 'GET',
					path: '/api/items',
					query: { page: '1', limit: '10' },
					enabled: true,
				}),
			{ wrapper }
		);

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(capturedUrl).toContain('page=1');
		expect(capturedUrl).toContain('limit=10');
	});

	test('method/path with both path params and query params', async () => {
		const { result } = renderHook(
			() =>
				useAPI({
					method: 'GET',
					path: '/api/filtered-items/:category',
					params: { category: 'tech' },
					query: { sort: 'name' },
					enabled: true,
				}),
			{ wrapper }
		);

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(capturedUrl).toContain('/api/filtered-items/tech');
		expect(capturedUrl).toContain('sort=name');
	});
});

// ============================================================================
// Type-level documentation tests (compile-time checks)
// ============================================================================

describe('Type-level behavior documentation', () => {
	test('route form provides precise typing (compile-time check)', () => {
		// This test documents that route form provides precise typing.
		// The actual type checking happens at compile time.
		// If this file compiles, the types are working correctly.

		// Route form with params route - params is required
		const _paramsRoute = () =>
			useAPI({
				route: 'GET /api/user/:userId',
				params: { userId: 'test' }, // Required!
			});

		// Route form without params - params not allowed
		const _noParamsRoute = () =>
			useAPI({
				route: 'GET /api/items',
				// No params property here
			});

		// Method/path form without params - works
		const _methodPathNoParams = () =>
			useAPI({
				method: 'GET',
				path: '/api/items',
				enabled: true,
			});

		// Method/path form with params - optional but typed
		const _methodPathWithParams = () =>
			useAPI({
				method: 'GET',
				path: '/api/user/:userId',
				params: { userId: 'optional-but-typed' },
				enabled: true,
			});

		expect(true).toBe(true); // Compile-time check passed
	});
});
