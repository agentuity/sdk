import { createRouter } from '@agentuity/runtime';
import agent from './agent';

const router = createRouter();

// GET endpoint for simple testing
router.get('/', async (c) => {
	const result = await c.var.agent.lifecycle.run({
		message: 'Hello from lifecycle test',
	});
	return c.json(result);
});

// POST endpoint with validation
router.post('/', agent.validator(), async (c) => {
	const data = c.req.valid('json');
	const result = await c.var.agent.lifecycle.run(data);
	return c.json(result);
});

export default router;
