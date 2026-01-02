import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';
import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';

const simpleAgent = createAgent('llm-call', {
	description: 'Basic agent with input/output validation',
	schema: {
		input: s.object({
			question: s.string(),
		}),
		output: s.string(),
	},
	handler: async (ctx, { question }) => {
		// Intentional delay for testing loading/streaming states in workbench UI
		await new Promise((resolve) => setTimeout(resolve, 3000));
		const { text } = await generateText({
			model: openai('gpt-4o'),
			prompt: question,
		});

		return text;
	},
});

export default simpleAgent;
