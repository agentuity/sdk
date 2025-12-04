import { createAgent } from '@agentuity/runtime';
import { z } from 'zod';

const agent = createAgent({
	metadata: {
		name: 'Multi Word Test',
		description: 'Test agent with multiple hyphens (multi-word-test)',
	},
	schema: {
		input: z.object({ data: z.string() }),
		output: z.string(),
	},
	handler: async (_c, { data }) => {
		return `Multi-word agent processed: ${data}`;
	},
});

export default agent;
