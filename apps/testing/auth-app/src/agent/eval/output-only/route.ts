import { createRouter } from '@agentuity/runtime';

const router = createRouter();

router.get('/', async (c) => {
	const result = await c.agent.eval.outputOnly.run();
	return c.text(result);
});

router.post('/', async (c) => {
	const result = await c.agent.eval.outputOnly.run();
	return c.text(result);
});

export default router;
