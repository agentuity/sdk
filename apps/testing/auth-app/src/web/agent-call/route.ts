import { createRouter } from '@agentuity/runtime';

const router = createRouter();

router.get('/', async (c) => {
	// Test that ctx.agent is available in API routes
	if (!c.agent) {
		return c.json({ error: 'ctx.agent is not available' }, 500);
	}

	// Call the simple agent
	try {
		const result = await c.agent.simple.run({ name: 'API Caller', age: 42 });
		return c.json({
			success: true,
			agentResult: result,
			message: 'Successfully called agent from API route',
		});
	} catch (error) {
		return c.json(
			{
				success: false,
				error: error instanceof Error ? error.message : String(error),
			},
			500
		);
	}
});

router.post('/with-input', async (c) => {
	const body = await c.req.json();
	const { name, age } = body;

	if (!c.agent) {
		return c.json({ error: 'ctx.agent is not available' }, 500);
	}

	try {
		const result = await c.agent.simple.run({ name, age });
		return c.json({
			success: true,
			agentResult: result,
			message: 'Successfully called agent from API route with custom input',
		});
	} catch (error) {
		return c.json(
			{
				success: false,
				error: error instanceof Error ? error.message : String(error),
			},
			500
		);
	}
});

export default router;
