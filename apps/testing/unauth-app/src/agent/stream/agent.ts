import { createAgent } from '@agentuity/runtime';
import { z } from 'zod';

export default createAgent({
	metadata: {
		name: 'Stream Test',
		description: 'A test agent that streams data',
	},
	schema: {
		input: z.file(),
		output: z.string(),
	},
	handler: async (c, input) => {
		console.log('🔍 [Stream Test] Input:', input);
		try {
			return await input.text();
		} catch (error) {
			throw new Error(
				`Failed to read file content: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	},
});
