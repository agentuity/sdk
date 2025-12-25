import { createRouter } from '@agentuity/runtime';
import hello from '@agent/hello';
import { auth, authMiddleware, optionalAuthMiddleware } from '../auth';

const api = createRouter();

// BetterAuth handler routes - handles signup, signin, signout, session, token, etc.
// Routes: /auth/sign-up/email, /auth/sign-in/email, /auth/sign-out, /auth/session, /auth/token, etc.
api.on(['GET', 'POST'], '/auth/*', (c) => {
	return auth.handler(c.req.raw);
});

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

// Protected route - requires authentication
api.get('/me', authMiddleware, async (c) => {
	const user = await c.var.auth.getUser();
	return c.json({
		id: user.id,
		name: user.name,
		email: user.email,
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

export default api;
