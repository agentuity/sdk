import { createRouter } from '@agentuity/runtime';

const router = createRouter();

router.get('/', async (c) => {
	// Uses camelCase version: myTestAgent
	const output = await c.agent.myTestAgent.run('hello world');
	return c.text(output);
});

export default router;
