import { createRouter } from '@agentuity/runtime';
import agent from './agent';

const router = createRouter();

router.get('/', async (c) => {
	const text = await c.agent.simple.run({ name: 'Alice', age: 25 });
	return c.text(text);
});

router.post('/', agent.validator(), async (c) => {
	const data = c.req.valid('json');
	const text = await c.agent.simple.run(data);
	return c.text(text);
});

// Test route to validate c.var.agent works
router.post('/test-var', agent.validator(), async (c) => {
	const data = c.req.valid('json');
	const text = await c.var.agent.simple.run(data);
	return c.text(`via c.var.agent: ${text}`);
});

export default router;
