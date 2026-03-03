import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const sessionEventsAgent = createAgent('events-session', {
	description: 'Tests session event listeners (completed)',
	schema: {
		input: s.object({
			operation: s.string(),
		}),
		output: s.object({
			operation: s.string(),
			eventsReceived: s.array(s.string()),
			sessionId: s.string(),
			success: s.boolean(),
		}),
	},
	handler: async (ctx, input) => {
		const eventsReceived: string[] = [];

		// Register session event listener
		ctx.session.addEventListener('completed', (eventName, session) => {
			eventsReceived.push(`${eventName}:${session.id}`);
		});

		return {
			operation: input.operation,
			eventsReceived,
			sessionId: ctx.session.id,
			success: true,
		};
	},
});

export default sessionEventsAgent;
