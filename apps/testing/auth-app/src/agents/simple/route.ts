import { createRouter } from '@agentuity/runtime';
import { zValidator } from '@hono/zod-validator';
import agent from './agent';

const router = createRouter();

router.get('/', async (c) => {
	const text = await c.agent.simple.run({ name: 'Alice', age: 25 });
	return c.text(text);
});

router.post('/', zValidator('json', agent.inputSchema!), async (c) => {
	const data = c.req.valid('json');
	const text = await c.agent.simple.run(data);
	return c.text(text);
});

export default router;
