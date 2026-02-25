import { isStructuredError } from '@agentuity/core';
import { createRouter } from '@agentuity/runtime';
import echoAgent from '@agents/echo/agent';

const router = createRouter();

router.get('/health', (c) => {
	return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

router.post('/echo', echoAgent.validator(), async (c) => {
	try {
		const input = c.req.valid('json');
		const result = await echoAgent.run(input);
		return c.json(result);
	} catch (error) {
		const message = isStructuredError(error)
			? error.message
			: error instanceof Error
				? error.message
				: String(error);
		return c.json({ success: false, error: message }, 500);
	}
});

export default router;
