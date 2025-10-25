import { type AgentContext, createAgent } from '@agentuity/server';
import { z } from 'zod';

const agent = createAgent({
	schema: {
		input: z.string(),
		output: z.string(),
		stream: true,
	},
	handler: (_c: AgentContext, input: string) => {
		const stream = new ReadableStream<string>({
			async start(controller) {
				controller.enqueue(`You said: ${input}\n`);
				controller.close();
			},
		});
		return stream;
	},
});

export default agent;
