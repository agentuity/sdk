import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const agent = createAgent('websocket', {
	schema: {
		input: s.string(),
		output: s.object({ action: s.string(), result: s.string() }),
	},
	handler: async (_c, input) => {
		return { action: 'token', result: `you sent us: ${input}` };
	},
});

export default agent;
