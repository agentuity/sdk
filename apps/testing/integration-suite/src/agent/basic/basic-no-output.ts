import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const noOutputAgent = createAgent('no-output', {
	description: 'Agent with void output (side effects only)',
	schema: {
		input: s.object({
			action: s.string(),
		}),
	},
	handler: async (ctx, input) => {
		// Agent performs side effect but returns nothing
		ctx.logger?.info('Action performed: %s', input.action);
	},
});

export default noOutputAgent;
