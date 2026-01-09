/**
 * SSE Stream Agent
 *
 * Server-Sent Events for real-time streaming. SSE is a one-way protocol where
 * the server pushes data to the client - perfect for LLM token streaming, live
 * feeds, or progress updates.
 *
 * SSE vs alternatives:
 * - vs Raw streaming: SSE adds structure (event types, IDs) and auto-reconnect
 * - vs WebSocket: SSE is simpler but one-way only (server→client)
 *
 * The actual streaming happens in the route (router.sse) using streamText() from
 * the AI SDK. This agent exists for Workbench discovery but returns a fallback
 * message for direct calls since streaming requires the SSE transport.
 *
 * Docs: https://preview.agentuity.dev/v1/Build/Routes/sse
 */
import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';
const agent = createAgent('sse-stream', {
	description: 'Real-time LLM token streaming via Server-Sent Events',
	schema: {
		input: s.object({ prompt: s.string() }),
		output: s.string(),
	},
	handler: async (_ctx, { prompt }) => {
		// Non-streaming fallback for direct agent calls
		return `This agent is designed for SSE streaming. Use the /stream endpoint with prompt: "${prompt}"`;
	},
});

export default agent;
