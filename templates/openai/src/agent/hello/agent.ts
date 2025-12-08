import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';
import OpenAI from 'openai';

const client = new OpenAI();

const agent = createAgent('hello', {
	description: 'An agent using OpenAI SDK directly',
	schema: {
		input: s.object({ prompt: s.string() }),
		output: s.string(),
	},
	handler: async (_ctx, { prompt }) => {
		const completion = await client.chat.completions.create({
			model: 'gpt-5-mini',
			messages: [{ role: 'user', content: prompt }],
		});

		return completion.choices[0]?.message?.content ?? '';
	},
});

export default agent;
