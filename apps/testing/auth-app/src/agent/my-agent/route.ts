import { createRouter } from '@agentuity/runtime';
import { zValidator } from '@hono/zod-validator';
import agent from './agent';

const router = createRouter();

router.post('/', zValidator('json', agent.inputSchema), async (c) => {
	const data = c.req.valid('json');
	const text = await c.agent.myAgent.run(data);
	return c.text(text);
});

export default router;
