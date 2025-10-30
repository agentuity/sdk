import { createRouter } from '@agentuity/runtime';
import { zValidator } from '@hono/zod-validator';
import agent from './agent';

const router = createRouter();

router.get('/', async (c) => {
	const result = await c.agent.stream.run({
		operation: 'create',
		name: 'test-stream',
		content: 'Hello from Stream API!',
	});
	return c.json(result);
});

router.post('/', zValidator('json', agent.inputSchema!), async (c) => {
	const data = c.req.valid('json');
	const result = await c.agent.stream.run(data);
	return c.json(result);
});

export default router;
