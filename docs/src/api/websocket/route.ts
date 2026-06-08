/**
 * WebSocket Route - Real-time bidirectional communication demo.
 *
 * GET /          - Returns route info and feature list
 * WS /connect    - WebSocket endpoint with echo and heartbeat
 */
import { Hono } from 'hono';
import { upgradeWebSocket } from 'hono/bun';

interface LoggerLike {
	info(message: string, data?: unknown): void;
	error(message: string, data?: unknown): void;
}

interface RouteEnv {
	Variables: {
		logger?: LoggerLike;
		sessionId?: string;
	};
}

function clearHeartbeat(interval: ReturnType<typeof setInterval> | undefined): void {
	if (interval) {
		clearInterval(interval);
	}
}

const router = new Hono<RouteEnv>()

	.get('/', (c) => {
		return c.json({
			name: 'WebSocket Demo',
			description: 'Connect to /api/websocket/connect for real-time bidirectional communication',
			features: ['Echo messages', 'Server heartbeat every 15s', 'Timestamped responses'],
		});
	})

	.get(
		'/connect',
		upgradeWebSocket((c) => {
			let heartbeatInterval: ReturnType<typeof setInterval> | undefined;

			return {
				onOpen(_event, ws) {
					try {
						c.var.logger?.info('WebSocket client connected', {
							sessionId: c.var.sessionId,
						});

						ws.send(
							JSON.stringify({
								type: 'system',
								message: 'Connected! Send messages and I will echo them back.',
								timestamp: new Date().toISOString(),
							})
						);

						heartbeatInterval = setInterval(() => {
							try {
								ws.send(
									JSON.stringify({
										type: 'heartbeat',
										message: 'ping',
										timestamp: new Date().toISOString(),
									})
								);
							} catch (err) {
								c.var.logger?.error('WebSocket heartbeat failed', { error: err });
								clearHeartbeat(heartbeatInterval);
							}
						}, 15000);
					} catch (err) {
						c.var.logger?.error('WebSocket onOpen error', { error: err });
					}
				},

				async onMessage(event, ws) {
					try {
						if (typeof event.data !== 'string') {
							ws.send(
								JSON.stringify({
									type: 'error',
									message: 'Only text messages are supported by this demo',
									timestamp: new Date().toISOString(),
								})
							);
							return;
						}

						const message = event.data.trim();
						const timestamp = new Date().toISOString();
						c.var.logger?.info('WebSocket message received', { message });

						ws.send(
							JSON.stringify({
								type: 'echo',
								message: `[${timestamp}] Echo: ${message}`,
								original: message,
								timestamp,
							})
						);
					} catch (error) {
						c.var.logger?.error('WebSocket message error', { error });
						try {
							ws.send(
								JSON.stringify({
									type: 'error',
									message: 'Failed to process message',
									timestamp: new Date().toISOString(),
								})
							);
						} catch {
							// WebSocket already closed, can't send error response.
						}
					}
				},

				onClose() {
					c.var.logger?.info('WebSocket client disconnected');
					clearHeartbeat(heartbeatInterval);
				},
			};
		})
	);

export default router;
