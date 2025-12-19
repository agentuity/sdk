import { createRouter } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

export const inputSchema = s.object({
	message: s.string(),
});

export const outputSchema = s.object({
	echo: s.string(),
	timestamp: s.number(),
});

const router = createRouter();

router.websocket('/echo', (c) => (ws) => {
	ws.onMessage((event) => {
		// Parse JSON
		let parsed: unknown;
		try {
			parsed = JSON.parse(event.data as string);
		} catch (error) {
			c.var.logger.error('WebSocket JSON parse error:', error);
			ws.send(
				JSON.stringify({
					error: 'Invalid JSON',
					message: error instanceof Error ? error.message : String(error),
				})
			);
			return;
		}

		// Validate against inputSchema
		const validation = inputSchema.safeParse(parsed);
		if (!validation.success) {
			c.var.logger.warn('WebSocket validation failed:', validation.error);
			ws.send(
				JSON.stringify({
					error: 'Validation failed',
					message: validation.error.message,
					issues: validation.error.issues,
				})
			);
			return;
		}

		// Use validated data
		const data = validation.data;
		c.var.logger.info('WebSocket received valid message:', data);

		ws.send(
			JSON.stringify({
				echo: data.message,
				timestamp: Date.now(),
			})
		);
	});
});

export default router;
