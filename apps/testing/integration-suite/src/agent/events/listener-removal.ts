import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const listenerRemovalAgent = createAgent('events-removal', {
	description: 'Tests event listener removal (removeEventListener)',
	schema: {
		input: s.object({
			operation: s.string(),
			removeListener: s.boolean().optional(),
		}),
		output: s.object({
			operation: s.string(),
			eventsReceived: s.array(s.string()),
			success: s.boolean(),
		}),
	},
	handler: async (ctx, input) => {
		const eventsReceived: string[] = [];

		// Create a listener function
		const startedListener = () => {
			eventsReceived.push('started');
		};

		// Add the listener
		listenerRemovalAgent.addEventListener('started', startedListener);

		// Optionally remove it
		if (input.removeListener) {
			listenerRemovalAgent.removeEventListener('started', startedListener);
		}

		return {
			operation: input.operation,
			eventsReceived,
			success: true,
		};
	},
});

export default listenerRemovalAgent;
