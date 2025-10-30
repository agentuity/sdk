import { createRouter } from '@agentuity/runtime';
import { zValidator } from '@hono/zod-validator';
import agent from './agent';

const router = createRouter();

router.get('/', async (c) => {
	const result = await c.agent.keyvalue.run({
		operation: 'set',
		key: 'test-key',
		value: 'Hello from KeyValue!',
	});
	return c.json(result);
});

router.post('/', zValidator('json', agent.inputSchema!), async (c) => {
	const data = c.req.valid('json');
	const result = await c.agent.keyvalue.run(data);
	return c.json(result);
});

export default router;
