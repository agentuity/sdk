import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';
import { generateText } from 'ai';
import { xai } from '@ai-sdk/xai';

const agent = createAgent('hello', {
	description: 'An agent using Vercel AI SDK with xAI Grok',
	schema: {
		input: s.object({ prompt: s.string() }),
		output: s.string(),
	},
	handler: async (_ctx, { prompt }) => {
		const { text } = await generateText({
			model: xai('grok-3-fast'),
			prompt,
		});

		return text;
	},
});

export default agent;
