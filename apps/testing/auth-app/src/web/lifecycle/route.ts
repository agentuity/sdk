import { createRouter } from '@agentuity/runtime';

const router = createRouter();

// Test route that validates app state is available
// TypeScript should infer c's type from the router
router.get('/test', (c) => {
	console.log('📡 [LIFECYCLE API] GET /test called');

	// Validate app state is available and typed in the route
	const app = c.var.app;

	console.log('   ✅ App state available:', !!app);
	console.log('   ✅ App name:', app.appName);
	console.log('   ✅ App version:', app.version);
	console.log('   ✅ App started at:', app.startedAt);
	console.log('   ✅ Max connections:', app.config!.maxConnections);
	console.log('   ✅ Timeout:', app.config!.timeout);

	const uptime = Date.now() - app.startedAt!.getTime();

	return c.json({
		success: true,
		message: 'Lifecycle API route - app state validated',
		appState: {
			appName: app.appName,
			version: app.version,
			startedAt: app.startedAt,
			uptime: uptime,
			config: app.config,
		},
	});
});

// Test route that calls the lifecycle agent
router.post('/call-agent', async (c) => {
	console.log('📡 [LIFECYCLE API] POST /call-agent called');

	const app = c.var.app;
	console.log('   ✅ App name from API:', app.appName);

	// Call the lifecycle agent
	const result = await c.var.agent.lifecycle.run({
		message: 'Test from API route',
	});

	console.log('   ✅ Agent result:', result);

	return c.json({
		success: true,
		message: 'Called lifecycle agent from API route',
		appState: {
			appName: app.appName,
			version: app.version,
		},
		agentResult: result,
	});
});

export default router;
