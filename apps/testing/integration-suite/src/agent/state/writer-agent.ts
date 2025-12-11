/**
 * State Writer Agent
 *
 * Writes thread state that can be read by other agents.
 * Used to test cross-agent thread state sharing.
 */

import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const stateWriterAgent = createAgent('state-writer', {
	description: 'Write thread state for other agents to read',
	schema: {
		input: s.object({
			key: s.string(), // Key to write to thread state
			value: s.any(), // Value to write
		}),
		output: s.object({
			success: s.boolean(),
			threadId: s.string(),
			key: s.string(),
			value: s.any(),
		}),
	},
	handler: async (ctx, input) => {
		const { key, value } = input;

		// Write to thread state
		ctx.thread.state.set(key, value);

		return {
			success: true,
			threadId: ctx.thread.id,
			key,
			value,
		};
	},
});

export default stateWriterAgent;
