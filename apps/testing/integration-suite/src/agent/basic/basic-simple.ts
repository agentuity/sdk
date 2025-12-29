import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';
import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';

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
		// await new Promise((resolve) => setTimeout(resolve, 3000));

		const result = await generateText({
			model: openai('gpt-5-mini'),
			prompt: `Say hello to ${input.name}, who is ${input.age} years old.`,
		});

		return {
			message: result.text,
			timestamp: Date.now(),
		};
	},
});

export default simpleAgent;
