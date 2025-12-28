import { createRouter } from '@agentuity/runtime';
import { mountBetterAuthRoutes } from '@agentuity/auth/agentuity';
import { auth, authMiddleware, optionalAuthMiddleware } from '../auth';

import hello from '@agent/hello';

const api = createRouter();

/**
 * Mount BetterAuth routes for authentication.
 * Handles: sign-in, sign-up, sign-out, session, password reset, etc.
 */
api.on(['GET', 'POST'], '/auth/*', mountBetterAuthRoutes(auth));

/**
 * Public endpoint - available to everyone.
 */
api.post('/hello', hello.validator(), async (c) => {
	const data = c.req.valid('json');
	const result = await hello.run(data);
	return c.json(result);
});

/**
 * Protected endpoint - requires authentication.
 * Add authMiddleware to protect routes.
 */
api.get('/me', authMiddleware, async (c) => {
	const user = await c.var.auth.getUser();
	return c.json({
		id: user.id,
		email: user.email,
		name: user.name,
	});
});

/**
 * Optional auth endpoint - works for both anonymous and authenticated users.
 */
api.get('/greeting', optionalAuthMiddleware, async (c) => {
	const user = c.var.user;
	if (user) {
		return c.json({ message: `Hello, ${user.name || user.email}!` });
	}
	return c.json({ message: 'Hello, guest!' });
});

export default api;
