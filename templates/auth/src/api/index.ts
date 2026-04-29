import { createSessionMiddleware, mountAuthRoutes } from '@agentuity/auth';
import type { Env } from '@agentuity/runtime';
import { Hono } from 'hono';
import { auth } from '../auth';

// Chained method calls so the route types propagate into `typeof api`,
// which the Hono `hc<ApiRouter>` client uses for typed calls like
// `client.me.$get()`.
const api = new Hono<Env>()
	.on(['GET', 'POST'], '/auth/*', mountAuthRoutes(auth))
	.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }))
	.get('/me', createSessionMiddleware(auth), async (c) => {
		const user = await c.var.auth.getUser();

		const memberSince =
			user.createdAt instanceof Date
				? user.createdAt.toISOString()
				: typeof user.createdAt === 'string'
					? user.createdAt
					: null;

		return c.json({
			id: user.id,
			name: user.name ?? null,
			email: user.email,
			authMethod: c.var.auth.authMethod,
			memberSince,
		});
	});

export type ApiRouter = typeof api;

export default api;
