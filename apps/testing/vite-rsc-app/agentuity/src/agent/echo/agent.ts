import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const echoAgent = createAgent('echo', {
	description: 'Echoes back the input message with a timestamp',
	schema: {
		input: s.object({
			message: s.string(),
		}),
		output: s.object({
			echo: s.string(),
			timestamp: s.string(),
		}),
	},
	handler: async (ctx, input) => {
		ctx.logger.info('Echo agent received message', { message: input.message });

		return {
			echo: input.message,
			timestamp: new Date().toISOString(),
		};
	},
});

export default echoAgent;
