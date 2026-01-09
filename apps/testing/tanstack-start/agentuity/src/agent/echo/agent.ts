import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

export const EchoInput = s.object({
	message: s.string().describe('The message to echo back'),
});

export const EchoOutput = s.object({
	echo: s.string().describe('The echoed message'),
	timestamp: s.string().describe('ISO timestamp when the echo was processed'),
});

const agent = createAgent('echo', {
	description: 'A simple echo agent that returns the message with a timestamp',
	schema: {
		input: EchoInput,
		output: EchoOutput,
	},
	handler: async (ctx, { message }) => {
		ctx.logger.info('Echo request received', { message });

		return {
			echo: message,
			timestamp: new Date().toISOString(),
		};
	},
});

export default agent;
