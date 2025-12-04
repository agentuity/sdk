import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

export default createAgent({
	metadata: {
		name: 'Stream Test',
		description: 'A test agent that streams data',
	},
	schema: {
		input: s.any(),
		output: s.string(),
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
