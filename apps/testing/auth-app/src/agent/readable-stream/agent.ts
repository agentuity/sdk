import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const agent = createAgent({
	metadata: {
		name: 'ReadableStream Demo',
	},
	schema: {
		input: s.string(),
		output: s.string(),
		stream: true,
	},
	handler: (_c, input: string) => {
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
