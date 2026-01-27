/**
 * Test suite for GitHub Issue #767: useAPI hook doesn't support dynamic path parameters in invoke() method
 *
 * This test file validates the fix that allows passing dynamic path parameters
 * to the invoke() method at invocation time, rather than only at hook initialization.
 *
 * Tests cover:
 * 1. Static path string version (useAPI('DELETE /api/items/:itemId'))
 * 2. Method/path object version (useAPI({ method: 'DELETE', path: '/api/items/:itemId' }))
 * 3. RPC version (createAPIClient)
 * 4. Edge cases (multiple params, URL encoding, backwards compatibility)
 */

import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import { renderHook, waitFor, act } from '@testing-library/react';
import React from 'react';
import { s } from '@agentuity/schema';
import { mockFetch } from '@agentuity/test-utils';
import { AgentuityProvider, useAPI, createClient, setGlobalBaseUrl } from '@agentuity/react';

// Define schemas for testing
const _itemOutput = s.object({ id: s.string(), name: s.string() });
const _updateInput = s.object({ name: s.string() });
const _updateOutput = s.object({ id: s.string(), name: s.string(), updated: s.boolean() });
const _conversationOutput = s.object({ conversationId: s.string(), deleted: s.boolean() });
const _messageOutput = s.object({
	conversationId: s.string(),
	messageId: s.string(),
	content: s.string(),
});

/**
 * Extend RouteRegistry for testing dynamic params
 */
declare module '@agentuity/frontend' {
	interface RouteRegistry {
		// DELETE routes with params (main issue scenario)
		'DELETE /api/items/:itemId': {
			inputSchema: never;
			outputSchema: typeof _itemOutput;
			stream: false;
			params: { itemId: string };
		};
		'DELETE /api/conversations/:conversationId': {
			inputSchema: never;
			outputSchema: typeof _conversationOutput;
			stream: false;
			params: { conversationId: string };
		};

		// PUT routes with params and input
		'PUT /api/items/:itemId': {
			inputSchema: typeof _updateInput;
			outputSchema: typeof _updateOutput;
			stream: false;
			params: { itemId: string };
		};

		// POST routes with params
		'POST /api/items/:itemId/duplicate': {
			inputSchema: never;
			outputSchema: typeof _itemOutput;
			stream: false;
			params: { itemId: string };
		};

		// Multiple path params
		'DELETE /api/conversations/:conversationId/messages/:messageId': {
			inputSchema: never;
			outputSchema: typeof _messageOutput;
			stream: false;
			params: { conversationId: string; messageId: string };
		};

		// PATCH with params and input
		'PATCH /api/items/:itemId': {
			inputSchema: typeof _updateInput;
			outputSchema: typeof _updateOutput;
			stream: false;
			params: { itemId: string };
		};
	}
}

// Capture request details
let capturedUrl: string | undefined;
let capturedMethod: string | undefined;
let capturedBody: string | undefined;

// Mock fetch
const originalFetch = globalThis.fetch;

beforeAll(() => {
	mockFetch(async (url, init) => {
		capturedUrl = url instanceof Request ? url.url : url.toString();
		capturedMethod = init?.method || 'GET';
		capturedBody = init?.body as string | undefined;

		// DELETE /api/items/:itemId
		if (capturedMethod === 'DELETE' && capturedUrl.match(/\/api\/items\/[^/?]+$/)) {
			const itemId = capturedUrl.match(/\/api\/items\/([^/?]+)$/)?.[1];
			return new Response(JSON.stringify({ id: itemId, name: `Item ${itemId}` }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			});
		}

		// DELETE /api/conversations/:conversationId
		if (capturedMethod === 'DELETE' && capturedUrl.match(/\/api\/conversations\/[^/?]+$/)) {
			const conversationId = capturedUrl.match(/\/api\/conversations\/([^/?]+)$/)?.[1];
			return new Response(JSON.stringify({ conversationId, deleted: true }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			});
		}

		// DELETE /api/conversations/:conversationId/messages/:messageId
		if (
			capturedMethod === 'DELETE' &&
			capturedUrl.match(/\/api\/conversations\/[^/]+\/messages\/[^/?]+$/)
		) {
			const match = capturedUrl.match(/\/api\/conversations\/([^/]+)\/messages\/([^/?]+)$/);
			return new Response(
				JSON.stringify({
					conversationId: match?.[1],
					messageId: match?.[2],
					content: 'deleted',
				}),
				{
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				}
			);
		}

		// PUT /api/items/:itemId
		if (capturedMethod === 'PUT' && capturedUrl.match(/\/api\/items\/[^/?]+$/)) {
			const itemId = capturedUrl.match(/\/api\/items\/([^/?]+)$/)?.[1];
			const body = capturedBody ? JSON.parse(capturedBody) : {};
			return new Response(JSON.stringify({ id: itemId, name: body.name, updated: true }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			});
		}

		// POST /api/items/:itemId/duplicate
		if (capturedMethod === 'POST' && capturedUrl.match(/\/api\/items\/[^/]+\/duplicate$/)) {
			const itemId = capturedUrl.match(/\/api\/items\/([^/]+)\/duplicate$/)?.[1];
			return new Response(JSON.stringify({ id: `${itemId}-copy`, name: `Copy of ${itemId}` }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			});
		}

		// PATCH /api/items/:itemId
		if (capturedMethod === 'PATCH' && capturedUrl.match(/\/api\/items\/[^/?]+$/)) {
			const itemId = capturedUrl.match(/\/api\/items\/([^/?]+)$/)?.[1];
			const body = capturedBody ? JSON.parse(capturedBody) : {};
			return new Response(JSON.stringify({ id: itemId, name: body.name, updated: true }), {
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

// ============================================================================
// Issue #767: Static path string version - dynamic params in invoke()
// ============================================================================

describe('Issue #767: Static path string version - dynamic params in invoke()', () => {
	test('DELETE route - invoke with dynamic params', async () => {
		const { result } = renderHook(() => useAPI('DELETE /api/items/:itemId'), { wrapper });

		await waitFor(() => expect(result.current.invoke).toBeDefined());

		await act(async () => {
			await result.current.invoke(undefined, { params: { itemId: 'dynamic-123' } });
		});

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(capturedUrl).toBe('http://localhost:3000/api/items/dynamic-123');
		expect(capturedMethod).toBe('DELETE');
		expect(result.current.data?.id).toBe('dynamic-123');
	});

	test('DELETE route - invoke with different params on each call', async () => {
		const { result } = renderHook(() => useAPI('DELETE /api/conversations/:conversationId'), {
			wrapper,
		});

		await waitFor(() => expect(result.current.invoke).toBeDefined());

		// First call with one ID
		await act(async () => {
			await result.current.invoke(undefined, { params: { conversationId: 'conv-1' } });
		});
		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(capturedUrl).toBe('http://localhost:3000/api/conversations/conv-1');

		// Reset and call with different ID
		await act(async () => {
			result.current.reset();
		});

		await act(async () => {
			await result.current.invoke(undefined, { params: { conversationId: 'conv-2' } });
		});
		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(capturedUrl).toBe('http://localhost:3000/api/conversations/conv-2');
	});

	test('PUT route - invoke with input AND dynamic params', async () => {
		const { result } = renderHook(() => useAPI('PUT /api/items/:itemId'), { wrapper });

		await waitFor(() => expect(result.current.invoke).toBeDefined());

		await act(async () => {
			await result.current.invoke({ name: 'Updated Name' }, { params: { itemId: 'item-456' } });
		});

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(capturedUrl).toBe('http://localhost:3000/api/items/item-456');
		expect(capturedMethod).toBe('PUT');
		expect(result.current.data?.id).toBe('item-456');
		expect(result.current.data?.name).toBe('Updated Name');
		expect(result.current.data?.updated).toBe(true);
	});

	test('POST route - invoke with dynamic params (no input)', async () => {
		const { result } = renderHook(() => useAPI('POST /api/items/:itemId/duplicate'), { wrapper });

		await waitFor(() => expect(result.current.invoke).toBeDefined());

		await act(async () => {
			await result.current.invoke(undefined, { params: { itemId: 'original-item' } });
		});

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(capturedUrl).toBe('http://localhost:3000/api/items/original-item/duplicate');
		expect(capturedMethod).toBe('POST');
		expect(result.current.data?.id).toBe('original-item-copy');
	});

	test('PATCH route - invoke with input AND dynamic params', async () => {
		const { result } = renderHook(() => useAPI('PATCH /api/items/:itemId'), { wrapper });

		await waitFor(() => expect(result.current.invoke).toBeDefined());

		await act(async () => {
			await result.current.invoke({ name: 'Patched Name' }, { params: { itemId: 'patch-item' } });
		});

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(capturedUrl).toBe('http://localhost:3000/api/items/patch-item');
		expect(capturedMethod).toBe('PATCH');
		expect(result.current.data?.name).toBe('Patched Name');
	});
});

// ============================================================================
// Issue #767: Method/path object version - dynamic params in invoke()
// ============================================================================

describe('Issue #767: Method/path object version - dynamic params in invoke()', () => {
	test('DELETE with method/path - invoke with dynamic params', async () => {
		const { result } = renderHook(
			() =>
				useAPI({
					method: 'DELETE',
					path: '/api/items/:itemId',
				}),
			{ wrapper }
		);

		await waitFor(() => expect(result.current.invoke).toBeDefined());

		await act(async () => {
			await result.current.invoke(undefined, { params: { itemId: 'method-path-123' } });
		});

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(capturedUrl).toBe('http://localhost:3000/api/items/method-path-123');
	});

	test('DELETE with method/path - hook-level params as fallback', async () => {
		const { result } = renderHook(
			() =>
				useAPI({
					method: 'DELETE',
					path: '/api/items/:itemId',
					params: { itemId: 'default-item' },
				}),
			{ wrapper }
		);

		await waitFor(() => expect(result.current.invoke).toBeDefined());

		// Invoke without params - should use hook-level params
		await act(async () => {
			await result.current.invoke();
		});

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(capturedUrl).toBe('http://localhost:3000/api/items/default-item');
	});

	test('DELETE with method/path - invoke params override hook-level params', async () => {
		const { result } = renderHook(
			() =>
				useAPI({
					method: 'DELETE',
					path: '/api/items/:itemId',
					params: { itemId: 'default-item' },
				}),
			{ wrapper }
		);

		await waitFor(() => expect(result.current.invoke).toBeDefined());

		// Invoke with params - should override hook-level params
		await act(async () => {
			await result.current.invoke(undefined, { params: { itemId: 'override-item' } });
		});

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(capturedUrl).toBe('http://localhost:3000/api/items/override-item');
	});

	test('PUT with method/path - invoke with input AND dynamic params', async () => {
		const { result } = renderHook(
			() =>
				useAPI({
					method: 'PUT',
					path: '/api/items/:itemId',
				}),
			{ wrapper }
		);

		await waitFor(() => expect(result.current.invoke).toBeDefined());

		await act(async () => {
			await result.current.invoke(
				{ name: 'Method Path Update' },
				{ params: { itemId: 'mp-item-789' } }
			);
		});

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(capturedUrl).toBe('http://localhost:3000/api/items/mp-item-789');
		expect(result.current.data?.name).toBe('Method Path Update');
	});
});

// ============================================================================
// Issue #767: Multiple path parameters
// ============================================================================

describe('Issue #767: Multiple path parameters', () => {
	test('DELETE with multiple params - invoke with all params dynamically', async () => {
		const { result } = renderHook(
			() => useAPI('DELETE /api/conversations/:conversationId/messages/:messageId'),
			{ wrapper }
		);

		await waitFor(() => expect(result.current.invoke).toBeDefined());

		await act(async () => {
			await result.current.invoke(undefined, {
				params: { conversationId: 'conv-abc', messageId: 'msg-xyz' },
			});
		});

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(capturedUrl).toBe('http://localhost:3000/api/conversations/conv-abc/messages/msg-xyz');
		expect(result.current.data?.conversationId).toBe('conv-abc');
		expect(result.current.data?.messageId).toBe('msg-xyz');
	});

	test('DELETE with multiple params via method/path - dynamic params', async () => {
		const { result } = renderHook(
			() =>
				useAPI({
					method: 'DELETE',
					path: '/api/conversations/:conversationId/messages/:messageId',
				}),
			{ wrapper }
		);

		await waitFor(() => expect(result.current.invoke).toBeDefined());

		await act(async () => {
			await result.current.invoke(undefined, {
				params: { conversationId: 'conv-123', messageId: 'msg-456' },
			});
		});

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(capturedUrl).toBe('http://localhost:3000/api/conversations/conv-123/messages/msg-456');
	});
});

// ============================================================================
// Issue #767: Edge cases
// ============================================================================

describe('Issue #767: Edge cases', () => {
	test('URL encoding of special characters in dynamic params', async () => {
		const { result } = renderHook(() => useAPI('DELETE /api/items/:itemId'), { wrapper });

		await waitFor(() => expect(result.current.invoke).toBeDefined());

		await act(async () => {
			await result.current.invoke(undefined, { params: { itemId: 'item/with/slashes' } });
		});

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(capturedUrl).toBe('http://localhost:3000/api/items/item%2Fwith%2Fslashes');
	});

	test('URL encoding of spaces and special chars', async () => {
		const { result } = renderHook(() => useAPI('DELETE /api/items/:itemId'), { wrapper });

		await waitFor(() => expect(result.current.invoke).toBeDefined());

		await act(async () => {
			await result.current.invoke(undefined, { params: { itemId: 'item with spaces & symbols!' } });
		});

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(capturedUrl).toBe(
			'http://localhost:3000/api/items/item%20with%20spaces%20%26%20symbols!'
		);
	});

	test('Backwards compatibility - invoke without options still works', async () => {
		const { result } = renderHook(
			() =>
				useAPI({
					route: 'DELETE /api/items/:itemId',
					params: { itemId: 'static-item' },
				}),
			{ wrapper }
		);

		await waitFor(() => expect(result.current.invoke).toBeDefined());

		// Call invoke without any arguments - should use hook-level params
		await act(async () => {
			await result.current.invoke();
		});

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(capturedUrl).toBe('http://localhost:3000/api/items/static-item');
	});

	test('Backwards compatibility - invoke with only input (no options)', async () => {
		const { result } = renderHook(
			() =>
				useAPI({
					route: 'PUT /api/items/:itemId',
					params: { itemId: 'static-put-item' },
				}),
			{ wrapper }
		);

		await waitFor(() => expect(result.current.invoke).toBeDefined());

		// Call invoke with only input - should use hook-level params
		await act(async () => {
			await result.current.invoke({ name: 'Just Input' });
		});

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(capturedUrl).toBe('http://localhost:3000/api/items/static-put-item');
		expect(result.current.data?.name).toBe('Just Input');
	});

	test('Empty params object does not override hook-level params', async () => {
		const { result } = renderHook(
			() =>
				useAPI({
					route: 'DELETE /api/items/:itemId',
					params: { itemId: 'hook-level-item' },
				}),
			{ wrapper }
		);

		await waitFor(() => expect(result.current.invoke).toBeDefined());

		// Call invoke with empty params object - should still use hook-level params
		// because we check for invokeOptions?.params which would be undefined
		await act(async () => {
			await result.current.invoke(undefined, {});
		});

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(capturedUrl).toBe('http://localhost:3000/api/items/hook-level-item');
	});
});

// ============================================================================
// Issue #767: RPC client version (createClient/createAPIClient)
// ============================================================================

describe('Issue #767: RPC client - existing dynamic params behavior', () => {
	test('RPC client can call same method with different params (no issue)', async () => {
		// This test proves the RPC client does NOT have the issue because
		// path params are passed at invocation time, not at initialization
		setGlobalBaseUrl('http://localhost:3000');

		interface TestRegistry {
			items: {
				$itemId: {
					delete: {
						input: never;
						output: { id: string; name: string };
						type: 'api';
						params: { itemId: string };
						paramsTuple: [itemId: string];
					};
				};
			};
		}

		const metadata = {
			items: {
				$itemId: {
					delete: {
						type: 'api',
						path: '/api/items/:itemId',
						pathParams: ['itemId'],
					},
				},
			},
		};

		const client = createClient<TestRegistry>({}, metadata);

		// First call with one ID
		await client.items.$itemId.delete('first-item');
		expect(capturedUrl).toBe('http://localhost:3000/api/items/first-item');

		// Second call with different ID - works because params are passed at invocation
		await client.items.$itemId.delete('second-item');
		expect(capturedUrl).toBe('http://localhost:3000/api/items/second-item');

		// Third call with yet another ID
		await client.items.$itemId.delete('third-item');
		expect(capturedUrl).toBe('http://localhost:3000/api/items/third-item');
	});

	test('RPC client with path params uses positional arguments', async () => {
		setGlobalBaseUrl('http://localhost:3000');

		interface TestRegistry {
			items: {
				$itemId: {
					delete: {
						input: never;
						output: { id: string; name: string };
						type: 'api';
						params: { itemId: string };
						paramsTuple: [itemId: string];
					};
				};
			};
		}

		const metadata = {
			items: {
				$itemId: {
					delete: {
						type: 'api',
						path: '/api/items/:itemId',
						pathParams: ['itemId'],
					},
				},
			},
		};

		const client = createClient<TestRegistry>({}, metadata);

		// RPC client uses positional arguments for path params
		const result = await client.items.$itemId.delete('rpc-item-123');

		expect(capturedUrl).toBe('http://localhost:3000/api/items/rpc-item-123');
		expect(capturedMethod).toBe('DELETE');
		expect(result?.id).toBe('rpc-item-123');
	});

	test('RPC client with multiple path params', async () => {
		setGlobalBaseUrl('http://localhost:3000');

		interface TestRegistry {
			conversations: {
				$conversationId: {
					messages: {
						$messageId: {
							delete: {
								input: never;
								output: { conversationId: string; messageId: string; content: string };
								type: 'api';
								params: { conversationId: string; messageId: string };
								paramsTuple: [conversationId: string, messageId: string];
							};
						};
					};
				};
			};
		}

		const metadata = {
			conversations: {
				$conversationId: {
					messages: {
						$messageId: {
							delete: {
								type: 'api',
								path: '/api/conversations/:conversationId/messages/:messageId',
								pathParams: ['conversationId', 'messageId'],
							},
						},
					},
				},
			},
		};

		const client = createClient<TestRegistry>({}, metadata);

		// RPC client uses positional arguments for multiple path params
		const result = await client.conversations.$conversationId.messages.$messageId.delete(
			'rpc-conv-1',
			'rpc-msg-2'
		);

		expect(capturedUrl).toBe('http://localhost:3000/api/conversations/rpc-conv-1/messages/rpc-msg-2');
		expect(result?.conversationId).toBe('rpc-conv-1');
		expect(result?.messageId).toBe('rpc-msg-2');
	});

	test('RPC client with path params and input', async () => {
		setGlobalBaseUrl('http://localhost:3000');

		interface TestRegistry {
			items: {
				$itemId: {
					put: {
						input: { name: string };
						output: { id: string; name: string; updated: boolean };
						type: 'api';
						params: { itemId: string };
						paramsTuple: [itemId: string];
					};
				};
			};
		}

		const metadata = {
			items: {
				$itemId: {
					put: {
						type: 'api',
						path: '/api/items/:itemId',
						pathParams: ['itemId'],
					},
				},
			},
		};

		const client = createClient<TestRegistry>({}, metadata);

		// RPC client: positional path param, then options object with input
		const result = await client.items.$itemId.put('rpc-put-item', { input: { name: 'RPC Update' } });

		expect(capturedUrl).toBe('http://localhost:3000/api/items/rpc-put-item');
		expect(capturedMethod).toBe('PUT');
		expect(result?.name).toBe('RPC Update');
	});
});

// ============================================================================
// Issue #767: Real-world scenario from the issue
// ============================================================================

describe('Issue #767: Real-world scenario - DeleteButton component', () => {
	test('Simulates the DeleteButton use case from the issue', async () => {
		// This test simulates the exact scenario from the issue:
		// A DeleteButton component that needs to delete different items
		// based on user interaction

		const { result } = renderHook(
			() =>
				useAPI({
					method: 'DELETE',
					path: '/api/items/:itemId',
					// No params at hook level - will be provided dynamically
				}),
			{ wrapper }
		);

		await waitFor(() => expect(result.current.invoke).toBeDefined());

		// Simulate user clicking delete on item '123'
		const itemToDelete = '123';
		await act(async () => {
			await result.current.invoke(undefined, { params: { itemId: itemToDelete } });
		});

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(capturedUrl).toBe('http://localhost:3000/api/items/123');

		// Reset and simulate user clicking delete on a different item
		await act(async () => {
			result.current.reset();
		});

		const anotherItemToDelete = '456';
		await act(async () => {
			await result.current.invoke(undefined, { params: { itemId: anotherItemToDelete } });
		});

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(capturedUrl).toBe('http://localhost:3000/api/items/456');
	});

	test('Simulates conversation deletion from the issue', async () => {
		// Another real-world scenario: deleting conversations

		const { result } = renderHook(() => useAPI('DELETE /api/conversations/:conversationId'), {
			wrapper,
		});

		await waitFor(() => expect(result.current.invoke).toBeDefined());

		// Delete conversation based on user selection
		const selectedConversationId = 'conv-user-selected';
		await act(async () => {
			await result.current.invoke(undefined, {
				params: { conversationId: selectedConversationId },
			});
		});

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(capturedUrl).toBe('http://localhost:3000/api/conversations/conv-user-selected');
		expect(result.current.data?.deleted).toBe(true);
	});
});
