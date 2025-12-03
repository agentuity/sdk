import { createRouter } from '@agentuity/runtime';
import { zValidator } from '@hono/zod-validator';
import agent from './agent';

const router = createRouter();

router.get('/', async (c) => {
	await c.agent.eval.inputOnly.run({ message: 'test' });
	return c.json({ success: true });
});

router.post('/', zValidator('json', agent.inputSchema), async (c) => {
	const data = c.req.valid('json');
	await c.agent.eval.inputOnly.run(data);
	return c.json({ success: true });
});

export default router;
