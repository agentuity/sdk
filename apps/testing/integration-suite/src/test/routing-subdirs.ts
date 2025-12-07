/**
 * Subdirectory API Route Tests
 *
 * Tests that subdirectory routes are properly discovered, mounted,
 * and accessible at their expected paths with TypeScript support.
 */

import { test } from '@test/suite';
import { assertEqual, assertDefined, assert } from '@test/helpers';

// Test: Subdirectory route mounted at /api/auth
test('routing-subdirs', 'auth-login', async () => {
	const response = await fetch('http://localhost:3500/api/auth/login', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ username: 'testuser', password: 'testpass' }),
	});

	assertEqual(response.status, 200);

	const data = (await response.json()) as { token: string; expiresAt: number };
	assertDefined(data.token);
	assert(data.token.startsWith('token-'), 'Token should start with "token-"');
	assert(data.expiresAt > Date.now(), 'ExpiresAt should be in the future');
});

// Test: Subdirectory route logout endpoint
test('routing-subdirs', 'auth-logout', async () => {
	const response = await fetch('http://localhost:3500/api/auth/logout', {
		method: 'POST',
	});

	assertEqual(response.status, 200);

	const data = (await response.json()) as { success: boolean };
	assertEqual(data.success, true);
});

// Test: Subdirectory route verify endpoint
test('routing-subdirs', 'auth-verify', async () => {
	const response = await fetch('http://localhost:3500/api/auth/verify', {
		headers: { Authorization: 'Bearer test-token' },
	});

	assertEqual(response.status, 200);

	const data = (await response.json()) as { valid: boolean };
	assertEqual(data.valid, true);
});

// Test: Nested subdirectory route at /api/users/profile
test('routing-subdirs', 'nested-profile-get', async () => {
	const response = await fetch('http://localhost:3500/api/users/profile');

	assertEqual(response.status, 200);

	const data = (await response.json()) as {
		id: string;
		username: string;
		email: string;
		createdAt: number;
	};

	assertDefined(data.id);
	assertEqual(data.username, 'testuser');
	assertEqual(data.email, 'test@example.com');
	assert(data.createdAt > 0, 'CreatedAt should be a valid timestamp');
});

// Test: Nested subdirectory PATCH endpoint
test('routing-subdirs', 'nested-profile-patch', async () => {
	const response = await fetch('http://localhost:3500/api/users/profile', {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ username: 'updateduser', email: 'updated@example.com' }),
	});

	assertEqual(response.status, 200);

	const data = (await response.json()) as {
		id: string;
		username: string;
		email: string;
	};

	assertEqual(data.username, 'updateduser');
	assertEqual(data.email, 'updated@example.com');
});

// Test: Nested subdirectory DELETE endpoint
test('routing-subdirs', 'nested-profile-delete', async () => {
	const response = await fetch('http://localhost:3500/api/users/profile', {
		method: 'DELETE',
	});

	assertEqual(response.status, 200);

	const data = (await response.json()) as { deleted: boolean };
	assertEqual(data.deleted, true);
});

// Test: TypeScript interfaces work in route files
test('routing-subdirs', 'typescript-interfaces', async () => {
	// This test validates that routes with TypeScript interfaces compile and run
	// The auth/route.ts and users/profile/route.ts both use interfaces extensively

	const authResponse = await fetch('http://localhost:3500/api/auth/login', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ username: 'typetest', password: 'pass' }),
	});

	assertEqual(authResponse.status, 200);

	const profileResponse = await fetch('http://localhost:3500/api/users/profile');
	assertEqual(profileResponse.status, 200);

	// If we got here, TypeScript compilation and runtime worked correctly
	assert(true, 'Routes with TypeScript interfaces executed successfully');
});

// Test: Different HTTP methods on same path
test('routing-subdirs', 'multiple-methods-same-path', async () => {
	// GET /api/users/profile
	const getResponse = await fetch('http://localhost:3500/api/users/profile');
	assertEqual(getResponse.status, 200);

	// PATCH /api/users/profile
	const patchResponse = await fetch('http://localhost:3500/api/users/profile', {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ username: 'patchtest' }),
	});
	assertEqual(patchResponse.status, 200);

	// DELETE /api/users/profile
	const deleteResponse = await fetch('http://localhost:3500/api/users/profile', {
		method: 'DELETE',
	});
	assertEqual(deleteResponse.status, 200);

	// All methods should coexist on same path
	assert(true, 'Multiple HTTP methods work on same route path');
});
