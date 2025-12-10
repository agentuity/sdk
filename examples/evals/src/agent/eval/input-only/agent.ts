import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const agent = createAgent('eval/input-only', {
	schema: {
		input: s.object({ message: s.string() }),
	},
	handler: async (_c, { message }) => {
		console.log('input-only message', message);
	},
});

export default agent;
