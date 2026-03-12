import { Hono } from 'hono';
import type { Env } from '@agentuity/runtime';
import echoAgent from '@agents/echo/agent';

const router = new Hono<Env>()
	.get('/health', (c) => {
		return c.json({ status: 'ok', timestamp: new Date().toISOString() });
	})
	.post('/echo', echoAgent.validator(), async (c) => {
		const input = c.req.valid('json');
		const result = await echoAgent.run(input);
		return c.json(result);
	});

export type ApiRouter = typeof router;

export default router;
