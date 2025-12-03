import { createRouter } from '@agentuity/runtime';

const router = createRouter();

router.get('/', async (c) => {
	const text = await c.agent.aisdk.run('Why is the sky blue?');
	return c.text(text);
});

export default router;
