/**
 * API routes are automatically mounted by the Agentuity runtime.
 *
 * This file demonstrates protected routes using Clerk authentication.
 */

import type { Context } from 'hono';
import { createRouter } from '@agentuity/runtime';
import { createMiddleware } from '@agentuity/auth/clerk';
import hello from '@agent/hello';

const router = createRouter();

// Public hello endpoint (from base template)
router.post('/hello', hello.validator(), async (c) => {
	const data = c.req.valid('json');
	const result = await hello.run(data);
	return c.json(result);
});

// Protected route - requires authentication
router.get('/profile', createMiddleware(), async (c: Context) => {
	const user = await c.var.auth.requireUser();

	// Access Clerk JWT payload
	const payload = c.var.auth.raw;
	console.log('JWT subject:', payload.sub);

	return c.json({
		id: user.id,
		name: user.name,
		email: user.email,
		// Access Clerk-specific fields via user.raw
		imageUrl: user.raw.imageUrl,
		createdAt: user.raw.createdAt,
	});
});

// Public route example (no auth required)
router.get('/public', async (c: Context) => {
	return c.json({ message: 'This is a public endpoint' });
});

export default router;
