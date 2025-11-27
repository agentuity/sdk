import { createRouter } from '@agentuity/runtime';

const router = createRouter();

router.get('/', async (c) => {
	c.waitUntil(() => c.agent.async.run());
	return c.text('Async task started');
});

// Test that c.executionCtx.waitUntil routes to our WaitUntilHandler
router.get('/execution-ctx', async (c) => {
	c.executionCtx.waitUntil(c.agent.async.run());
	return c.text('Async task started via executionCtx');
});

export default router;
