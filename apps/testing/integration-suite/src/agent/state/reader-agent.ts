/**
 * State Reader Agent
 *
 * Reads thread state set by other agents.
 * Used to test cross-agent thread state sharing.
 */

import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const stateReaderAgent = createAgent('state-reader', {
	description: 'Read thread state set by other agents',
	schema: {
		input: s.object({
			key: s.string(), // Key to read from thread state
		}),
		output: s.object({
			success: s.boolean(),
			threadId: s.string(),
			value: s.any().optional(),
			allKeys: s.array(s.string()),
		}),
	},
	handler: async (ctx, input) => {
		const { key } = input;

		// Get value for the requested key
		const value = await ctx.thread.state.get(key);

		// Get all keys in thread state
		const allKeys = await ctx.thread.state.keys();

		return {
			success: true,
			threadId: ctx.thread.id,
			value,
			allKeys,
		};
	},
});

export default stateReaderAgent;
