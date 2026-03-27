import { isStructuredError } from '@agentuity/core';
import { Hono } from 'hono';
import type { Env } from '@agentuity/runtime';
import echoAgent from '@agents/echo/agent';

const router = new Hono<Env>()
	.get('/health', (c) => {
		return c.json({ status: 'ok', timestamp: new Date().toISOString() });
	})
	.post('/echo', echoAgent.validator(), async (c) => {
		try {
			const input = c.req.valid('json');
			const result = await echoAgent.run(input);
			return c.json(result);
		} catch (error) {
			const message = isStructuredError(error)
				? error.message
				: error instanceof Error
					? error.message
					: String(error);
			return c.json({ success: false, error: message }, 500);
		}
	});

export type ApiRouter = typeof router;

export default router;
