import { createRouter } from '@agentuity/runtime';

const router = createRouter();

router.sse('/', (c) => async (stream) => {
	const interval = setInterval(async () => {
		try {
			const text = await c.agent.sse.run();
			await stream.write(text);
		} catch (err) {
			c.get('logger')?.error('SSE write error', { error: err });
		}
	}, 1_000);

	stream.onAbort(() => {
		c.get('logger')?.info('SSE connection aborted');
		clearInterval(interval);
	});

	// Keep the connection alive - don't return/resolve until aborted
	await new Promise(() => {});
});

export default router;
