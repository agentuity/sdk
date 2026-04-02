/**
 * Hello Route - Basic agent invocation.
 *
 * GET /  - Returns greeting with default name "World"
 * POST / - Returns greeting with custom name from JSON body
 */
import { type Env } from '@agentuity/runtime';
import helloAgent from '../../agent/hello/agent';
import { Hono } from 'hono';

const router = new Hono<Env>()

	.get('/', async (c) => {
		const text = await helloAgent.run({ name: 'World' });
		return c.text(text);
	})

	// validator() auto-validates request body against agent's input schema
	.post('/', helloAgent.validator(), async (c) => {
		const data = c.req.valid('json');
		const text = await helloAgent.run(data);
		return c.text(text);
	});

export default router;
