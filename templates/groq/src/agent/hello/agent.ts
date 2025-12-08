import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';
import Groq from 'groq-sdk';

const client = new Groq();

const agent = createAgent('hello', {
	description: 'An agent using Groq SDK with open-source models',
	schema: {
		input: s.object({ prompt: s.string() }),
		output: s.string(),
	},
	handler: async (_ctx, { prompt }) => {
		const completion = await client.chat.completions.create({
			model: 'openai/gpt-oss-20b',
			messages: [{ role: 'user', content: prompt }],
		});

		return completion.choices[0]?.message?.content ?? '';
	},
});

export default agent;
