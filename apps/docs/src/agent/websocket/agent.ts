/**
 * WebSocket Agent
 *
 * Bidirectional real-time messaging - both client and server can send anytime.
 * Unlike SSE (one-way server→client), WebSockets maintain a persistent two-way
 * connection with no request/response overhead.
 *
 * Use WebSockets for:
 * - Chat applications
 * - Collaborative editing
 * - Multiplayer games
 * - Anything needing instant back-and-forth
 *
 * The route (router.websocket) handles the connection lifecycle (onOpen, onClose).
 * This agent processes individual messages - it's a simple echo that adds timestamps.
 *
 * Docs: https://preview.agentuity.dev/v1/Build/Routes/websockets
 */
import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';
const agent = createAgent('websocket', {
	description: 'Echo agent for WebSocket messages with timestamps',
	schema: {
		input: s.string(),
		output: s.string(),
	},
	handler: async (ctx, input) => {
		const trimmed = input.trim();
		const timestamp = new Date().toLocaleTimeString();

		// Logging is available via ctx.logger
		ctx.logger.info('WebSocket message received', { message: trimmed });

		return `[${timestamp}] Echo: ${trimmed}`;
	},
});

export default agent;
