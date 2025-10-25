import { createRouter } from '@agentuity/server';

const router = createRouter();

router.sse('/', (c) => async (stream) => {
	const interval = setInterval(async () => {
		try {
			const text = await c.agent.sse.run();
			await stream.write(text);
		} catch (err) {
			console.error('SSE write error:', err);
		}
	}, 1_000);

	stream.onAbort(() => {
		console.log('SSE connection aborted');
		clearInterval(interval);
	});

	// Keep the connection alive - don't return/resolve until aborted
	await new Promise(() => {});
});

export default router;
