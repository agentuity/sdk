import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

/**
 * Counter agent for testing thread state persistence in workbench
 * Increments a counter stored in thread state and returns the current value
 */
const agent = createAgent('counter', {
	description: 'A counter agent that uses thread state for E2E testing',
	schema: {
		input: s.object({
			action: s.string(),
		}),
		output: s.object({
			count: s.number(),
			action: s.string(),
		}),
	},
	handler: async (ctx, { action }) => {
		const currentCount = await ctx.thread.state.get<number | undefined>('count');
		let count = currentCount ?? 0;

		switch (action) {
			case 'increment':
				count++;
				break;
			case 'decrement':
				count--;
				break;
			case 'reset':
				count = 0;
				break;
			case 'get':
			default:
				break;
		}

		await ctx.thread.state.set('count', count);

		return { count, action };
	},
});

export default agent;
