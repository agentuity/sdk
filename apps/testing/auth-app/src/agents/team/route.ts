import { createRouter } from '@agentuity/runtime';
import { zValidator } from '@hono/zod-validator';
import agent from './agent';

const router = createRouter();

router.get('/', async (c) => {
	const result = await c.agent.team.run({ action: 'info' });
	return c.json(result);
});

if (!agent.inputSchema) {
	throw new Error('Agent inputSchema is required for POST route validation');
}

router.post('/', zValidator('json', agent.inputSchema), async (c) => {
	const data = c.req.valid('json');
	const result = await c.agent.team.run(data);
	return c.json(result);
});

export default router;
