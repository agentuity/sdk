import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const agent = createAgent({
	metadata: {
		name: 'Multi Word Test',
		description: 'Test agent with multiple hyphens (multi-word-test)',
	},
	schema: {
		input: s.object({ data: s.string() }),
		output: s.string(),
	},
	handler: async (_c, { data }) => {
		return `Multi-word agent processed: ${data}`;
	},
});

export default agent;
