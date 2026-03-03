/**
 * Agent ID Test Agent
 *
 * A simple agent used to verify that agent IDs are correctly captured
 * in session events. This agent returns its own metadata for verification.
 */

import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const agentIdTestAgent = createAgent('agent-id-test', {
	description: 'Test agent for verifying agent ID capture in session events',
	schema: {
		input: s.object({
			message: s.string().optional(),
		}),
		output: s.object({
			success: s.boolean(),
			agentName: s.string(),
			agentId: s.string().optional(),
			metadataId: s.string().optional(),
			message: s.string().optional(),
		}),
	},
	handler: async (ctx, input) => {
		ctx.logger.info('agent-id-test handler called with message: %s', input.message);

		// Return simple result - metadata can be checked via the agent object directly in tests
		return {
			success: true,
			agentName: 'agent-id-test',
			agentId: undefined,
			metadataId: undefined,
			message: input.message || 'Agent executed successfully',
		};
	},
});

export default agentIdTestAgent;
