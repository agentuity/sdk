/**
 * WebSocket Route - Real-time bidirectional communication demo.
 *
 * GET /          - Returns route info and feature list
 * WS /connect    - WebSocket endpoint with echo and heartbeat
 */
import { createRouter, websocket } from "@agentuity/runtime";
import websocketAgent from "../../agent/websocket/agent";

const router = createRouter();

router.get("/", (c) => {
	return c.json({
		name: "WebSocket Demo",
		description:
			"Connect to /api/websocket/connect for real-time bidirectional communication",
		features: [
			"Echo messages",
			"Server heartbeat every 15s",
			"Timestamped responses",
		],
	});
});

router.get("/connect", websocket((c, ws) => {
	let heartbeatInterval: Timer;

	ws.onOpen(() => {
		try {
			c.var.logger?.info("WebSocket client connected", {
				sessionId: c.var.sessionId,
			});

			ws.send(
				JSON.stringify({
					type: "system",
					message: "Connected! Send messages and I will echo them back.",
					timestamp: new Date().toISOString(),
				}),
			);

			// Heartbeat every 15s to keep connection alive
			heartbeatInterval = setInterval(() => {
				try {
					ws.send(
						JSON.stringify({
							type: "heartbeat",
							message: "ping",
							timestamp: new Date().toISOString(),
						}),
					);
				} catch (err) {
					c.var.logger?.error("WebSocket heartbeat failed", { error: err });
					clearInterval(heartbeatInterval);
				}
			}, 15000);
		} catch (err) {
			c.var.logger?.error("WebSocket onOpen error", { error: err });
		}
	});

	ws.onMessage(async (event) => {
		try {
			const message = event.data as string;
			c.var.logger?.info("WebSocket message received", { message });

			const response = await websocketAgent.run(message);

			ws.send(
				JSON.stringify({
					type: "echo",
					message: response,
					original: message,
					timestamp: new Date().toISOString(),
				}),
			);
		} catch (error) {
			c.var.logger?.error("WebSocket message error", { error });
			ws.send(
				JSON.stringify({
					type: "error",
					message: "Failed to process message",
					timestamp: new Date().toISOString(),
				}),
			);
		}
	});

	ws.onClose(() => {
		c.var.logger?.info("WebSocket client disconnected");
		clearInterval(heartbeatInterval);
	});
}));

export default router;
