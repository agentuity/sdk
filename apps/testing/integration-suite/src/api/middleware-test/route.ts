/**
 * Route for testing middleware patterns
 * Tests both app.ts middleware and api/index.ts middleware
 */

import { createRouter } from '@agentuity/runtime';

const router = createRouter();

router.get('/check-all', (c) => {
	// Check app.ts middleware
	const authUser = c.get('authUser');
	const requestId = c.get('requestId');
	const requestCount = c.get('requestCount');
	const appLevelData = c.get('appLevelData');

	// Check api/index.ts middleware
	const clickhouseClient = c.get('clickhouseClient');
	const postgresClient = c.get('postgresClient');
	const apiLevelData = c.get('apiLevelData');

	return c.json({
		success: true,
		appMiddleware: {
			hasAuth: !!authUser,
			authUser: authUser || null,
			requestId: requestId || null,
			requestCount: requestCount || null,
			appLevelData: appLevelData || null,
		},
		apiMiddleware: {
			hasClickhouse: !!clickhouseClient,
			hasPostgres: !!postgresClient,
			apiLevelData: apiLevelData || null,
		},
	});
});

router.get('/query-database', async (c) => {
	const clickhouse = c.get('clickhouseClient');
	const postgres = c.get('postgresClient');

	if (!clickhouse || !postgres) {
		return c.json(
			{
				error: 'Database clients not available',
				hasClickhouse: !!clickhouse,
				hasPostgres: !!postgres,
			},
			500
		);
	}

	// Test querying both databases
	const [clickhouseResult, postgresResult] = await Promise.all([
		clickhouse.query('SELECT * FROM test_table'),
		postgres.query('SELECT * FROM users'),
	]);

	return c.json({
		success: true,
		clickhouse: {
			connected: clickhouse.connected,
			result: clickhouseResult,
		},
		postgres: {
			connected: postgres.connected,
			result: postgresResult,
		},
	});
});

router.get('/check-auth', (c) => {
	const user = c.get('authUser');

	if (!user) {
		return c.json({ error: 'Not authenticated' }, 401);
	}

	return c.json({
		authenticated: true,
		user: {
			id: user.id,
			email: user.email,
			role: user.role,
		},
	});
});

router.get('/analytics-info', (c) => {
	return c.json({
		requestId: c.get('requestId') || 'none',
		requestCount: c.get('requestCount') || 0,
	});
});

export default router;
