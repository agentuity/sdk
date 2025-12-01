import { createRouter } from '@agentuity/runtime';
import { zValidator } from '@hono/zod-validator';
import agent from './agent';

const router = createRouter();

router.post('/', zValidator('json', agent.inputSchema!), async (c) => {
	const data = c.req.valid('json');
	const result = await c.agent.state.run(data);
	return c.json(result);
});

export default router;
