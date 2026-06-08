/**
 * Hello Route - Basic agent invocation.
 *
 * GET /  - Returns greeting with default name "World"
 * POST / - Returns greeting with custom name from JSON body
 */
import type { ApiEnv } from '../context';
import helloAgent from '../../agent/hello/agent';
import { Hono } from 'hono';

const router = new Hono<ApiEnv>()

	.get('/', async (c) => {
		const text = await helloAgent.run({ name: 'World' });
		return c.text(text);
	})

	.post('/', async (c) => {
		const data = await c.req.json();
		const text = await helloAgent.run(data);
		return c.text(text);
	});

export default router;
