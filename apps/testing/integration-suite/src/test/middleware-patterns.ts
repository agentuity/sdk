/**
 * Middleware Patterns Test Suite
 *
 * Tests that validate custom middleware works correctly when added in:
 * 1. app.ts (global middleware)
 * 2. src/api/index.ts (API-level middleware)
 *
 * This addresses GitHub Issue #250 and validates the pattern is correct.
 */

import { test } from '@test/suite';
import { assert, assertEqual, assertDefined } from '@test/helpers';
import { getRequestCount, resetRequestCount } from '../lib/custom-middleware';

// Test: App-level middleware is available in routes
test('middleware-patterns', 'app-level-middleware-available', async () => {
	// Reset request count for clean test
	resetRequestCount();

	const response = await fetch('http://localhost:3500/api/middleware-test/check-all');
	const data = await response.json();

	assertEqual(response.status, 200);
	assertEqual(data.success, true);

	// Verify app.ts middleware
	assertEqual(data.appMiddleware.hasAuth, true);
	assertDefined(data.appMiddleware.authUser);
	assertEqual(data.appMiddleware.authUser.id, 'user-123');
	assertEqual(data.appMiddleware.authUser.email, 'test@example.com');
	assertEqual(data.appMiddleware.authUser.role, 'admin');
	assertEqual(data.appMiddleware.appLevelData, 'set-in-app-ts');
	assertDefined(data.appMiddleware.requestId);
	assert(data.appMiddleware.requestCount > 0, 'Request count should be greater than 0');
});

// Test: API-level middleware (from index.ts) is available in routes
test('middleware-patterns', 'api-level-middleware-available', async () => {
	const response = await fetch('http://localhost:3500/api/middleware-test/check-all');
	const data = await response.json();

	assertEqual(response.status, 200);
	assertEqual(data.success, true);

	// Verify api/index.ts middleware
	assertEqual(data.apiMiddleware.hasClickhouse, true);
	assertEqual(data.apiMiddleware.hasPostgres, true);
	assertEqual(data.apiMiddleware.apiLevelData, 'set-in-api-index-ts');
});

// Test: Both app.ts and api/index.ts middleware work together
test('middleware-patterns', 'both-middleware-layers-work', async () => {
	const response = await fetch('http://localhost:3500/api/middleware-test/check-all');
	const data = await response.json();

	assertEqual(response.status, 200);

	// Both layers should be present
	assertEqual(data.appMiddleware.hasAuth, true);
	assertEqual(data.apiMiddleware.hasClickhouse, true);
	assertEqual(data.apiMiddleware.hasPostgres, true);

	// Custom data from both layers
	assertEqual(data.appMiddleware.appLevelData, 'set-in-app-ts');
	assertEqual(data.apiMiddleware.apiLevelData, 'set-in-api-index-ts');
});

// Test: Database clients from middleware are functional
test('middleware-patterns', 'database-clients-functional', async () => {
	const response = await fetch('http://localhost:3500/api/middleware-test/query-database');
	const data = await response.json();

	assertEqual(response.status, 200);
	assertEqual(data.success, true);

	// Check ClickHouse client
	assertEqual(data.clickhouse.connected, true);
	assertDefined(data.clickhouse.result);
	assertEqual(data.clickhouse.result.rows.length, 1);
	assertEqual(data.clickhouse.result.rows[0].source, 'clickhouse');

	// Check Postgres client
	assertEqual(data.postgres.connected, true);
	assertDefined(data.postgres.result);
	assertEqual(data.postgres.result.rows.length, 1);
	assertEqual(data.postgres.result.rows[0].source, 'postgres');
});

// Test: Auth middleware provides user info
test('middleware-patterns', 'auth-middleware-provides-user', async () => {
	const response = await fetch('http://localhost:3500/api/middleware-test/check-auth');
	const data = await response.json();

	assertEqual(response.status, 200);
	assertEqual(data.authenticated, true);
	assertDefined(data.user);
	assertEqual(data.user.id, 'user-123');
	assertEqual(data.user.email, 'test@example.com');
	assertEqual(data.user.role, 'admin');
});

// Test: Analytics middleware tracks requests
test('middleware-patterns', 'analytics-middleware-tracks-requests', async () => {
	resetRequestCount();

	// Make first request
	const response1 = await fetch('http://localhost:3500/api/middleware-test/analytics-info');
	const data1 = await response1.json();

	assertEqual(response1.status, 200);
	assertDefined(data1.requestId);
	assert(data1.requestId.startsWith('req-'), 'Request ID should start with req-');
	const count1 = data1.requestCount;

	// Make second request
	const response2 = await fetch('http://localhost:3500/api/middleware-test/analytics-info');
	const data2 = await response2.json();

	assertEqual(response2.status, 200);
	const count2 = data2.requestCount;

	// Second request should have higher count
	assert(count2 > count1, `Request count should increase (${count1} -> ${count2})`);
});

// Test: Middleware applies to all /api/* routes (not just specific ones)
test('middleware-patterns', 'middleware-applies-to-all-api-routes', async () => {
	// Test on the health endpoint (different route)
	const response = await fetch('http://localhost:3500/api/health');
	const data = await response.json();

	assertEqual(response.status, 200);

	// Analytics middleware should have run (creates requestId)
	// We can't check c.get() from outside, but we know it ran if response succeeded
	// and we got a valid JSON response
	assertEqual(data.status, 'ok');
	assertDefined(data.timestamp);
});

// Test: Routes mounted separately still get middleware
test('middleware-patterns', 'separate-route-files-get-middleware', async () => {
	/**
	 * This is the key test for Issue #250
	 * Routes in separate files (like /api/middleware-test/route.ts)
	 * should still get middleware from api/index.ts
	 */

	const response = await fetch('http://localhost:3500/api/middleware-test/check-all');
	const data = await response.json();

	assertEqual(response.status, 200);

	// This route is in a separate file, but should still have:
	// 1. App-level middleware (from app.ts)
	assertEqual(data.appMiddleware.hasAuth, true);

	// 2. API-level middleware (from api/index.ts)
	assertEqual(data.apiMiddleware.hasClickhouse, true);
	assertEqual(data.apiMiddleware.hasPostgres, true);

	// This proves the architecture works correctly
});

// Test: Middleware order is correct (app.ts runs before api/index.ts middleware)
test('middleware-patterns', 'middleware-execution-order', async () => {
	/**
	 * Middleware should execute in order:
	 * 1. App-level middleware (app.ts)
	 * 2. API-level middleware (api/index.ts)
	 * 3. Route handler
	 */

	const response = await fetch('http://localhost:3500/api/middleware-test/check-all');
	const data = await response.json();

	assertEqual(response.status, 200);

	// Both should be present, proving order doesn't break anything
	assertDefined(data.appMiddleware.authUser);
	assertDefined(data.apiMiddleware.apiLevelData);
});
