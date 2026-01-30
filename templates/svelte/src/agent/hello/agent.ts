import { createAgent } from '@agentuity/runtime';
import { z } from 'zod';

export default createAgent({
	name: 'hello',
	description: 'A simple greeting agent',
	input: z.object({
		name: z.string().describe('The name to greet'),
	}),
	output: z.object({
		greeting: z.string().describe('The greeting message'),
	}),
	handler: async (request, response, context) => {
		const { name } = await request.data.json();
		context.logger.info(`Greeting ${name}`);
		return response.json({
			greeting: `Hello, ${name}! Welcome to Agentuity with Svelte.`,
		});
	},
});
