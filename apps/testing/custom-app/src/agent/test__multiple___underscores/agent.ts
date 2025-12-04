import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const agent = createAgent({
	metadata: {
		name: 'test__multiple___underscores',
		description: 'Test agent with multiple underscores',
	},
	schema: {
		input: s.string(),
		output: s.string(),
	},
	handler: async (_c, input) => {
		return input;
	},
});

export default agent;
