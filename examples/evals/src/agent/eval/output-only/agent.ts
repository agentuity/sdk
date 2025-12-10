import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const agent = createAgent('eval/output-only', {
	schema: {
		output: s.string(),
	},
	handler: async (_c) => {
		return 'Hello from output-only agent';
	},
});

export default agent;
