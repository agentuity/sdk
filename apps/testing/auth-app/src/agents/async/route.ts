import { createRouter } from '@agentuity/runtime';

const router = createRouter();

router.get('/', async (c) => {
	c.waitUntil(() => c.agent.async.run());
	return c.text('Async task started');
});

export default router;
