import { createRouter } from '@agentuity/runtime';
import { s, type Schema } from '@agentuity/schema';
import type { Context } from 'hono';
import type { WebSocketConnection } from '@agentuity/runtime';

export const inputSchema = s.object({
	message: s.string(),
});

export const outputSchema = s.object({
	echo: s.string(),
	timestamp: s.number(),
});

// Helper to validate WebSocket messages
function validateMessage<T>(
	schema: Schema<any, T>,
	event: any,
	ws: WebSocketConnection,
	logger: Context['var']['logger']
): T | null {
	// Parse JSON
	let parsed: unknown;
	try {
		parsed = JSON.parse(event.data as string);
	} catch (error) {
		logger.error('WebSocket JSON parse error:', error);
		ws.send(
			JSON.stringify({
				error: 'Invalid JSON',
				message: error instanceof Error ? error.message : String(error),
			})
		);
		return null;
	}

	// Validate against schema
	const validation = schema.safeParse(parsed);
	if (!validation.success) {
		logger.warn('WebSocket validation failed:', validation.error);
		ws.send(
			JSON.stringify({
				error: 'Validation failed',
				message: validation.error.message,
				issues: validation.error.issues,
			})
		);
		return null;
	}

	return validation.data;
}

const router = createRouter();

router.websocket('/', (c) => (ws) => {
	ws.onMessage((event) => {
		const data = validateMessage(inputSchema, event, ws, c.var.logger);
		if (!data) return;

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
