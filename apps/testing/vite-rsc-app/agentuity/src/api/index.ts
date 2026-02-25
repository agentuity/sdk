import { createRouter } from '@agentuity/runtime';
import echoAgent from '@agents/echo/agent';

const router = createRouter();

router.get('/health', (c) => {
	return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

router.post('/echo', echoAgent.validator(), async (c) => {
	const input = c.req.valid('json');
	const result = await echoAgent.run(input);
	return c.json(result);
});

export default router;
