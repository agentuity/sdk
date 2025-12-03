import { createRouter } from '@agentuity/runtime';

const router = createRouter();

router.get('/', async (c) => {
	const output = await c.agent.testMultipleUnderscores.run('hello');
	return c.text(output);
});

export default router;
