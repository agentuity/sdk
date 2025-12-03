import { createRouter } from '@agentuity/runtime';
import { zValidator } from '@hono/zod-validator';
import agent from './agent';

const router = createRouter();

router.get('/', async (c) => {
	const result = await c.agent.eval.run({ name: 'Alice', age: 25 });
	return c.text(result || '');
});

router.post('/', zValidator('json', agent.inputSchema), async (c) => {
	const data = c.req.valid('json');
	const result = await c.agent.eval.run(data);
	return c.text(result || '');
});

export default router;
