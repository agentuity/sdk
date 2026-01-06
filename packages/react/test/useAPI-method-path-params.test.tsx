/**
 * Test suite for GitHub Issue #417: Routes params type inference bug
 *
 * Problem: When using useAPI with {method, path} form, TypeScript incorrectly
 * requires `params` property even for routes declared with `params: never`.
 *
 * Root cause: When TRoute is inferred as a union of all matching routes,
 * RoutePathParams<TRoute> becomes a union of all params types. Since some
 * routes have params (e.g., { userId: string }), the conditional type
 * incorrectly requires params for ALL routes.
 *
 * This test file validates the fix by testing:
 * 1. Multiple routes with mixed params requirements
 * 2. Both `route` form and `{method, path}` form
 * 3. GET, POST, DELETE, PUT, PATCH methods
 * 4. Single param, multiple params, and no params routes
 */

import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import { renderHook, waitFor, act } from '@testing-library/react';
import React from 'react';
import { s } from '@agentuity/schema';
import { mockFetch } from '@agentuity/test-utils';
import { AgentuityProvider } from '../src/context';
import { useAPI } from '../src/api';

// Define schemas for testing (prefixed with _ as they're only used in typeof expressions)
const _usersListOutput = s.object({
	users: s.array(s.object({ id: s.string(), name: s.string() })),
});
const _userDetailOutput = s.object({ id: s.string(), name: s.string(), email: s.string() });
const _searchOutput = s.object({ results: s.array(s.string()), total: s.number() });
const _healthOutput = s.object({ status: s.string() });
const _loginInput = s.object({ email: s.string(), password: s.string() });
const _loginOutput = s.object({ token: s.string() });
const _sshTokenInput = s.object({
	deploymentId: s.string().optional(),
	projectId: s.string().optional(),
});
const _sshTokenOutput = s.object({ token: s.string(), region: s.string() });
const _orgMemberOutput = s.object({ orgId: s.string(), memberId: s.string(), role: s.string() });
const _itemOutput = s.object({ id: s.string(), deleted: s.boolean() });
const _updateInput = s.object({ name: s.string() });
const _updateOutput = s.object({ id: s.string(), name: s.string() });
const _patchInput = s.object({ status: s.string() });
const _patchOutput = s.object({ id: s.string(), status: s.string() });

/**
 * Extend RouteRegistry with a realistic mix of routes:
 * - Routes WITHOUT params (the problematic case in issue #417)
 * - Routes WITH single param
 * - Routes WITH multiple params
 * - Various HTTP methods (GET, POST, DELETE, PUT, PATCH)
 */
declare module '../src/types' {
	interface RouteRegistry {
		// ============================================
		// GET routes WITHOUT params
		// ============================================
		'GET /api/users': {
			inputSchema: never;
			outputSchema: typeof _usersListOutput;
			stream: false;
			params: never;
		};
		'GET /api/users/search': {
			inputSchema: never;
			outputSchema: typeof _searchOutput;
			stream: false;
			params: never;
		};
		'GET /api/health': {
			inputSchema: never;
			outputSchema: typeof _healthOutput;
			stream: false;
			params: never;
		};

		// ============================================
		// GET routes WITH params
		// ============================================
		'GET /api/users/:userId': {
			inputSchema: never;
			outputSchema: typeof _userDetailOutput;
			stream: false;
			params: { userId: string };
		};
		'GET /api/orgs/:orgId/members/:memberId': {
			inputSchema: never;
			outputSchema: typeof _orgMemberOutput;
			stream: false;
			params: { orgId: string; memberId: string };
		};
		'GET /api/items/:id': {
			inputSchema: never;
			outputSchema: typeof _itemOutput;
			stream: false;
			params: { id: string };
		};

		// ============================================
		// POST routes WITHOUT params
		// ============================================
		'POST /api/auth/login': {
			inputSchema: typeof _loginInput;
			outputSchema: typeof _loginOutput;
			stream: false;
			params: never;
		};
		'POST /api/ssh/token': {
			inputSchema: typeof _sshTokenInput;
			outputSchema: typeof _sshTokenOutput;
			stream: false;
			params: never;
		};

		// ============================================
		// POST routes WITH params
		// ============================================
		'POST /api/users/:userId/activate': {
			inputSchema: never;
			outputSchema: typeof _userDetailOutput;
			stream: false;
			params: { userId: string };
		};

		// ============================================
		// DELETE routes WITHOUT params
		// ============================================
		'DELETE /api/cache': {
			inputSchema: never;
			outputSchema: never;
			stream: false;
			params: never;
		};

		// ============================================
		// DELETE routes WITH params
		// ============================================
		'DELETE /api/items/:id': {
			inputSchema: never;
			outputSchema: typeof _itemOutput;
			stream: false;
			params: { id: string };
		};

		// ============================================
		// PUT routes WITHOUT params
		// ============================================
		'PUT /api/settings': {
			inputSchema: typeof _updateInput;
			outputSchema: typeof _updateOutput;
			stream: false;
			params: never;
		};

		// ============================================
		// PUT routes WITH params
		// ============================================
		'PUT /api/users/:userId': {
			inputSchema: typeof _updateInput;
			outputSchema: typeof _updateOutput;
			stream: false;
			params: { userId: string };
		};

		// ============================================
		// PATCH routes WITHOUT params
		// ============================================
		'PATCH /api/config': {
			inputSchema: typeof _patchInput;
			outputSchema: typeof _patchOutput;
			stream: false;
			params: never;
		};

		// ============================================
		// PATCH routes WITH params
		// ============================================
		'PATCH /api/items/:id': {
			inputSchema: typeof _patchInput;
			outputSchema: typeof _patchOutput;
			stream: false;
			params: { id: string };
		};
	}
}

// Capture the URL from fetch calls
let capturedUrl: string | undefined;
let capturedMethod: string | undefined;

// Mock fetch
const originalFetch = globalThis.fetch;

beforeAll(() => {
	mockFetch(async (url, init) => {
		capturedUrl = url instanceof Request ? url.url : url.toString();
		capturedMethod = init?.method || 'GET';

		// Simple mock responses - order matters! More specific routes first.

		// GET /api/users/search
		if (capturedUrl.includes('/api/users/search')) {
			return new Response(JSON.stringify({ results: ['user1', 'user2'], total: 2 }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			});
		}

		// POST /api/users/:userId/activate
		if (capturedUrl.match(/\/api\/users\/[^/]+\/activate/)) {
			const userId = capturedUrl.match(/\/api\/users\/([^/]+)\/activate/)?.[1];
			return new Response(
				JSON.stringify({ id: userId, name: 'Activated User', email: 'user@test.com' }),
				{
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				}
			);
		}

		// PUT /api/users/:userId - must match URL with a userId segment
		if (capturedMethod === 'PUT' && capturedUrl.match(/\/api\/users\/[^/?]+$/)) {
			const userId = capturedUrl.split('/api/users/')[1]?.split('?')[0];
			return new Response(JSON.stringify({ id: userId, name: 'Updated Name' }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			});
		}

		// GET /api/users/:userId - must match URL with a userId segment (not just /api/users)
		if (capturedMethod === 'GET' && capturedUrl.match(/\/api\/users\/[^/?]+$/)) {
			const userId = capturedUrl.split('/api/users/')[1]?.split('?')[0];
			return new Response(
				JSON.stringify({ id: userId, name: `User ${userId}`, email: 'test@test.com' }),
				{
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				}
			);
		}

		// GET /api/users (list, no userId) - must end with /api/users or /api/users?...
		if (capturedMethod === 'GET' && capturedUrl.match(/\/api\/users(\?.*)?$/)) {
			return new Response(
				JSON.stringify({
					users: [
						{ id: '1', name: 'User 1' },
						{ id: '2', name: 'User 2' },
					],
				}),
				{
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				}
			);
		}

		if (capturedUrl.includes('/api/health')) {
			return new Response(JSON.stringify({ status: 'ok' }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			});
		}

		if (capturedUrl.includes('/api/auth/login')) {
			return new Response(JSON.stringify({ token: 'test-token' }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			});
		}

		if (capturedUrl.includes('/api/ssh/token')) {
			return new Response(JSON.stringify({ token: 'ssh-token', region: 'us-east-1' }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			});
		}

		if (capturedUrl.includes('/api/orgs/') && capturedUrl.includes('/members/')) {
			const parts = capturedUrl.match(/\/api\/orgs\/([^/]+)\/members\/([^/?]+)/);
			return new Response(
				JSON.stringify({ orgId: parts?.[1], memberId: parts?.[2], role: 'admin' }),
				{
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				}
			);
		}

		if (capturedUrl.includes('/api/items/')) {
			const id = capturedUrl.match(/\/api\/items\/([^/?]+)/)?.[1];
			return new Response(JSON.stringify({ id, deleted: capturedMethod === 'DELETE' }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			});
		}

		if (capturedUrl.includes('/api/cache')) {
			return new Response(null, { status: 204 });
		}

		if (capturedUrl.includes('/api/settings')) {
			return new Response(JSON.stringify({ id: 'settings', name: 'Updated' }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			});
		}

		if (capturedUrl.includes('/api/config')) {
			return new Response(JSON.stringify({ id: 'config', status: 'updated' }), {
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
// ISSUE #417: method/path form should NOT require params for routes without params
// These tests validate the fix
// ============================================================================

describe('Issue #417: method/path form - routes WITHOUT params', () => {
	test('GET route without params - should not require params property', async () => {
		const { result } = renderHook(
			() =>
				useAPI({
					method: 'GET',
					path: '/api/users',
					enabled: true,
				}),
			{ wrapper }
		);

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(capturedUrl).toBe('http://localhost:3000/api/users');
		expect(result.current.data?.users).toHaveLength(2);
	});

	test('GET /api/users/search - should not require params property', async () => {
		const { result } = renderHook(
			() =>
				useAPI({
					method: 'GET',
					path: '/api/users/search',
					enabled: true,
					query: { q: 'test' },
				}),
			{ wrapper }
		);

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(capturedUrl).toContain('/api/users/search');
	});

	test('GET /api/health - should not require params property', async () => {
		const { result } = renderHook(
			() =>
				useAPI({
					method: 'GET',
					path: '/api/health',
					enabled: true,
				}),
			{ wrapper }
		);

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(capturedUrl).toBe('http://localhost:3000/api/health');
		expect(result.current.data?.status).toBe('ok');
	});

	test('POST /api/auth/login - should not require params property', async () => {
		const { result } = renderHook(
			() =>
				useAPI({
					method: 'POST',
					path: '/api/auth/login',
					input: { email: 'test@test.com', password: 'secret' },
				}),
			{ wrapper }
		);

		await waitFor(() => expect(result.current.invoke).toBeDefined());

		await act(async () => {
			await result.current.invoke({ email: 'test@test.com', password: 'secret' });
		});

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(capturedUrl).toBe('http://localhost:3000/api/auth/login');
	});

	test('POST /api/ssh/token - should not require params property (original issue example)', async () => {
		const { result } = renderHook(
			() =>
				useAPI({
					method: 'POST',
					path: '/api/ssh/token',
					input: { projectId: 'proj-123' },
				}),
			{ wrapper }
		);

		await waitFor(() => expect(result.current.invoke).toBeDefined());

		await act(async () => {
			await result.current.invoke({ projectId: 'proj-123' });
		});

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(capturedUrl).toBe('http://localhost:3000/api/ssh/token');
	});

	test('DELETE /api/cache - should not require params property', async () => {
		const { result } = renderHook(
			() =>
				useAPI({
					method: 'DELETE',
					path: '/api/cache',
				}),
			{ wrapper }
		);

		await waitFor(() => expect(result.current.invoke).toBeDefined());

		await act(async () => {
			await result.current.invoke();
		});

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(capturedUrl).toBe('http://localhost:3000/api/cache');
	});

	test('PUT /api/settings - should not require params property', async () => {
		const { result } = renderHook(
			() =>
				useAPI({
					method: 'PUT',
					path: '/api/settings',
					input: { name: 'New Settings' },
				}),
			{ wrapper }
		);

		await waitFor(() => expect(result.current.invoke).toBeDefined());

		await act(async () => {
			await result.current.invoke({ name: 'New Settings' });
		});

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(capturedUrl).toBe('http://localhost:3000/api/settings');
	});

	test('PATCH /api/config - should not require params property', async () => {
		const { result } = renderHook(
			() =>
				useAPI({
					method: 'PATCH',
					path: '/api/config',
					input: { status: 'active' },
				}),
			{ wrapper }
		);

		await waitFor(() => expect(result.current.invoke).toBeDefined());

		await act(async () => {
			await result.current.invoke({ status: 'active' });
		});

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(capturedUrl).toBe('http://localhost:3000/api/config');
	});
});

// ============================================================================
// method/path form WITH params - should accept optional params
// ============================================================================

describe('Issue #417: method/path form - routes WITH params (optional)', () => {
	test('GET with params provided - should work correctly', async () => {
		const { result } = renderHook(
			() =>
				useAPI({
					method: 'GET',
					path: '/api/users/:userId',
					params: { userId: 'user-123' },
					enabled: true,
				}),
			{ wrapper }
		);

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(capturedUrl).toBe('http://localhost:3000/api/users/user-123');
	});

	test('GET with multiple params provided - should work correctly', async () => {
		const { result } = renderHook(
			() =>
				useAPI({
					method: 'GET',
					path: '/api/orgs/:orgId/members/:memberId',
					params: { orgId: 'org-456', memberId: 'member-789' },
					enabled: true,
				}),
			{ wrapper }
		);

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(capturedUrl).toBe('http://localhost:3000/api/orgs/org-456/members/member-789');
	});

	test('DELETE with params provided - should work correctly', async () => {
		const { result } = renderHook(
			() =>
				useAPI({
					method: 'DELETE',
					path: '/api/items/:id',
					params: { id: 'item-999' },
				}),
			{ wrapper }
		);

		await waitFor(() => expect(result.current.invoke).toBeDefined());

		await act(async () => {
			await result.current.invoke();
		});

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(capturedUrl).toBe('http://localhost:3000/api/items/item-999');
	});

	test('PUT with params provided - should work correctly', async () => {
		const { result } = renderHook(
			() =>
				useAPI({
					method: 'PUT',
					path: '/api/users/:userId',
					params: { userId: 'user-to-update' },
					input: { name: 'Updated Name' },
				}),
			{ wrapper }
		);

		await waitFor(() => expect(result.current.invoke).toBeDefined());

		await act(async () => {
			await result.current.invoke({ name: 'Updated Name' });
		});

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(capturedUrl).toBe('http://localhost:3000/api/users/user-to-update');
	});

	test('PATCH with params provided - should work correctly', async () => {
		const { result } = renderHook(
			() =>
				useAPI({
					method: 'PATCH',
					path: '/api/items/:id',
					params: { id: 'item-to-patch' },
					input: { status: 'completed' },
				}),
			{ wrapper }
		);

		await waitFor(() => expect(result.current.invoke).toBeDefined());

		await act(async () => {
			await result.current.invoke({ status: 'completed' });
		});

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(capturedUrl).toBe('http://localhost:3000/api/items/item-to-patch');
	});

	test('POST with params provided - should work correctly', async () => {
		const { result } = renderHook(
			() =>
				useAPI({
					method: 'POST',
					path: '/api/users/:userId/activate',
					params: { userId: 'user-to-activate' },
				}),
			{ wrapper }
		);

		await waitFor(() => expect(result.current.invoke).toBeDefined());

		await act(async () => {
			await result.current.invoke();
		});

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(capturedUrl).toBe('http://localhost:3000/api/users/user-to-activate/activate');
	});
});

// ============================================================================
// route form - should still enforce strict params
// ============================================================================

describe('Route form - strict params enforcement (existing behavior)', () => {
	test('route form - route WITHOUT params should not require params', async () => {
		const { result } = renderHook(
			() =>
				useAPI({
					route: 'GET /api/users',
				}),
			{ wrapper }
		);

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(capturedUrl).toBe('http://localhost:3000/api/users');
	});

	test('route form - route WITH params requires params property', async () => {
		const { result } = renderHook(
			() =>
				useAPI({
					route: 'GET /api/users/:userId',
					params: { userId: 'user-456' },
				}),
			{ wrapper }
		);

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(capturedUrl).toBe('http://localhost:3000/api/users/user-456');
	});

	test('route form - multiple params route requires all params', async () => {
		const { result } = renderHook(
			() =>
				useAPI({
					route: 'GET /api/orgs/:orgId/members/:memberId',
					params: { orgId: 'org-111', memberId: 'member-222' },
				}),
			{ wrapper }
		);

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(capturedUrl).toBe('http://localhost:3000/api/orgs/org-111/members/member-222');
	});

	test('route form - POST without params works', async () => {
		const { result } = renderHook(
			() =>
				useAPI({
					route: 'POST /api/ssh/token',
				}),
			{ wrapper }
		);

		await waitFor(() => expect(result.current.invoke).toBeDefined());

		await act(async () => {
			await result.current.invoke({ deploymentId: 'deploy-123' });
		});

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
	});

	test('route form - DELETE without params works', async () => {
		const { result } = renderHook(
			() =>
				useAPI({
					route: 'DELETE /api/cache',
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
// Edge cases and mixed scenarios
// ============================================================================

describe('Edge cases and mixed scenarios', () => {
	test('method/path with query params but no path params', async () => {
		const { result } = renderHook(
			() =>
				useAPI({
					method: 'GET',
					path: '/api/users/search',
					query: { q: 'john', limit: '10' },
					enabled: true,
				}),
			{ wrapper }
		);

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(capturedUrl).toContain('/api/users/search');
		expect(capturedUrl).toContain('q=john');
		expect(capturedUrl).toContain('limit=10');
	});

	test('method/path with headers but no params', async () => {
		const { result } = renderHook(
			() =>
				useAPI({
					method: 'GET',
					path: '/api/health',
					headers: { 'X-Custom-Header': 'test-value' },
					enabled: true,
				}),
			{ wrapper }
		);

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(capturedUrl).toBe('http://localhost:3000/api/health');
	});

	test('method/path with enabled=false should not fetch', async () => {
		const { result } = renderHook(
			() =>
				useAPI({
					method: 'GET',
					path: '/api/users',
					enabled: false,
				}),
			{ wrapper }
		);

		// Should not be loading or successful since enabled=false
		expect(result.current.isLoading).toBe(false);
		expect(result.current.isSuccess).toBe(false);
		expect(result.current.data).toBeUndefined();
	});

	test('method/path POST with empty input object', async () => {
		const { result } = renderHook(
			() =>
				useAPI({
					method: 'POST',
					path: '/api/ssh/token',
					input: {},
				}),
			{ wrapper }
		);

		await waitFor(() => expect(result.current.invoke).toBeDefined());

		await act(async () => {
			await result.current.invoke({});
		});

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
	});

	test('URL-encode path params in method/path form', async () => {
		const { result } = renderHook(
			() =>
				useAPI({
					method: 'GET',
					path: '/api/users/:userId',
					params: { userId: 'user/with/slashes' },
					enabled: true,
				}),
			{ wrapper }
		);

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(capturedUrl).toBe('http://localhost:3000/api/users/user%2Fwith%2Fslashes');
	});

	test('multiple sequential calls with different paths (no params)', async () => {
		// First call to /api/health
		const { result: result1 } = renderHook(
			() =>
				useAPI({
					method: 'GET',
					path: '/api/health',
					enabled: true,
				}),
			{ wrapper }
		);

		await waitFor(() => expect(result1.current.isSuccess).toBe(true));

		// Second call to /api/users
		const { result: result2 } = renderHook(
			() =>
				useAPI({
					method: 'GET',
					path: '/api/users',
					enabled: true,
				}),
			{ wrapper }
		);

		await waitFor(() => expect(result2.current.isSuccess).toBe(true));
		expect(result2.current.data?.users).toBeDefined();
	});
});
