import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const threadEventsAgent = createAgent('events-thread', {
	description: 'Tests thread event listeners (destroyed)',
	schema: {
		input: s.object({
			operation: s.string(),
			destroyThread: s.boolean().optional(),
		}),
		output: s.object({
			operation: s.string(),
			eventsReceived: s.array(s.string()),
			threadId: s.string(),
			success: s.boolean(),
		}),
	},
	handler: async (ctx, input) => {
		const eventsReceived: string[] = [];

		// Register thread event listener
		ctx.thread.addEventListener('destroyed', (eventName, thread) => {
			eventsReceived.push(`${eventName}:${thread.id}`);
		});

		if (input.destroyThread) {
			await ctx.thread.destroy();
		}

		return {
			operation: input.operation,
			eventsReceived,
			threadId: ctx.thread.id,
			success: true,
		};
	},
});

export default threadEventsAgent;
