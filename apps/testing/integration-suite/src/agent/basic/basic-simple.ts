import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const simpleAgent = createAgent('simple', {
	description: 'Basic agent with input/output validation',
	schema: {
		input: s.object({
			name: s.string(),
			age: s.number(),
		}),
		output: s.object({
			message: s.string(),
			timestamp: s.number(),
		}),
	},
	handler: async (ctx, input) => {
		// Intentional delay for testing loading/streaming states in workbench UI
		await Bun.sleep(3000);

		return {
			message: `Hello, ${input.name}! You are ${input.age} years old.`,
			timestamp: Date.now(),
		};
	},
});

export default simpleAgent;
