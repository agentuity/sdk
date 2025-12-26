import { createRouter } from '@agentuity/runtime';
import { mountBetterAuthRoutes, requireScopes } from '@agentuity/auth/agentuity';
import hello from '@agent/hello';
import { auth, authMiddleware, optionalAuthMiddleware } from '../auth';

const api = createRouter();

// Mount BetterAuth routes (sign-in, sign-up, sign-out, session, token, etc.)
// See mountBetterAuthRoutes docs for why this wrapper is required
api.on(['GET', 'POST'], '/auth/*', mountBetterAuthRoutes(auth));

// Public route - no auth required
api.get('/health', (c) => {
	return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Existing hello route
api.post('/hello', hello.validator(), async (c) => {
	const data = c.req.valid('json');
	const result = await hello.run(data);
	return c.json(result);
});

// Protected route - requires authentication (session or API key)
api.get('/me', authMiddleware, async (c) => {
	const user = await c.var.auth.getUser();

	// Detect auth method for demo purposes
	const apiKeyHeader = c.req.header('x-api-key') ?? c.req.header('X-API-KEY');
	const authMethod = apiKeyHeader ? 'api-key' : 'session';

	return c.json({
		id: user.id,
		name: user.name,
		email: user.email,
		authMethod,
	});
});

// Optional auth route - works for both authenticated and anonymous users
api.get('/greeting', optionalAuthMiddleware, async (c) => {
	try {
		const user = await c.var.auth.getUser();
		return c.json({ message: `Hello, ${user.name || user.email}!` });
	} catch {
		return c.json({ message: 'Hello, anonymous user!' });
	}
});

// Protected route with token
api.get('/token', authMiddleware, async (c) => {
	const token = await c.var.auth.getToken();
	return c.json({
		hasToken: token !== null,
		tokenPreview: token ? `${token.slice(0, 10)}...` : null,
	});
});

// Example: Protected route with scope requirements
// This shows how to use requireScopes middleware for fine-grained access control
api.get('/admin', authMiddleware, requireScopes(['admin']), async (c) => {
	const user = await c.var.auth.getUser();
	return c.json({
		message: 'Welcome to the admin area!',
		userId: user.id,
	});
});

// Example: Protected route requiring multiple scopes
api.post('/projects', authMiddleware, requireScopes(['project:write']), async (c) => {
	const user = await c.var.auth.getUser();
	return c.json({
		message: 'Project creation authorized',
		userId: user.id,
	});
});

export default api;
