import { createAgent } from '@agentuity/runtime';
import { z } from 'zod';

const agent = createAgent('simple', {
	description: 'An agent thats not really an agent but shows off the structure',
	schema: {
		input: z.object({ name: z.string(), age: z.number() }),
		output: z.string(),
	},
	handler: async (_c, { name, age }) => {
		return `Hello, ${name}! You are ${age} years old.`;
	},
});

export default agent;
