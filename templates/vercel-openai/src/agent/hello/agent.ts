import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';

const agent = createAgent('hello', {
	description: 'An agent using Vercel AI SDK with OpenAI',
	schema: {
		input: s.object({ prompt: s.string() }),
		output: s.string(),
	},
	handler: async (_ctx, { prompt }) => {
		const { text } = await generateText({
			model: openai('gpt-5-mini'),
			prompt,
		});

		return text;
	},
});

export default agent;
