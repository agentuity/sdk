import { type AgentContext, createAgent } from '@agentuity/runtime';
import { z } from 'zod';
import { openai } from '@ai-sdk/openai';
import { generateText, type AssistantModelMessage, type TextPart } from 'ai';

const agent = createAgent({
	metadata: {
		name: 'AI SDK Demo',
	},
	schema: {
		input: z.string('the prompt to send'),
		output: z.string('the prompt output'),
	},
	handler: async (_c: AgentContext, prompt) => {
		const { response } = await generateText({
			model: openai('gpt-4o'),
			system: 'Please help me with this',
			messages: [{ role: 'user', content: prompt }],
		});
		const message = response.messages[0]!;
		const content = message.content as unknown as AssistantModelMessage[];
		const part = content[0] as unknown as TextPart;
		return part.text;
	},
});

export default agent;
