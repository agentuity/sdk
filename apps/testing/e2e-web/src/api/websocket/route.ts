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
		try {
			const data = JSON.parse(event.data as string);
			c.var.logger.info('WebSocket received:', data);
			ws.send(
				JSON.stringify({
					echo: data.message,
					timestamp: Date.now(),
				})
			);
		} catch (error) {
			c.var.logger.error('WebSocket parse error:', error);
		}
	});
});

export default router;
