/**
 * WebSocket Echo Agent
 *
 * Simple echo WebSocket that sends back any message it receives.
 * Used for testing basic WebSocket functionality.
 */

import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const echoAgent = createAgent('websocket-echo', {
	description: 'WebSocket echo server for testing',
	schema: {
		input: s
			.object({
				// No input - this is a WebSocket handler
			})
			.optional(),
		output: s
			.object({
				// No output - WebSocket connection
			})
			.optional(),
	},
	handler: async (ctx) => {
		ctx.logger.info('Echo agent handler called (this should not be used for WebSocket)');
		return {};
	},
});

export default echoAgent;
