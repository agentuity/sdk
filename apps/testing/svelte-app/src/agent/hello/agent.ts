import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

export default createAgent('hello', {
	description: 'A simple greeting agent',
	schema: {
		input: s.object({
			name: s.string().describe('The name to greet'),
		}),
		output: s.object({
			greeting: s.string().describe('The greeting message'),
		}),
	},
	handler: async (ctx, input) => {
		const { name } = input;
		ctx.logger.info(`Greeting ${name}`);
		return {
			greeting: `Hello, ${name}! Welcome to Agentuity with Svelte.`,
		};
	},
});
