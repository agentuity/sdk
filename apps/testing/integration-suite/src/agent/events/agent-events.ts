import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const agentEventsAgent = createAgent('events-agent', {
	description: 'Tests agent event listeners (started, completed, errored)',
	schema: {
		input: s.object({
			eventType: s.string(),
			shouldError: s.boolean().optional(),
		}),
		output: s.object({
			eventType: s.string(),
			eventsReceived: s.array(s.string()),
			success: s.boolean(),
		}),
	},
	handler: async (ctx, input) => {
		const eventsReceived: string[] = [];

		// Track which events fire during execution
		const startedListener = () => {
			eventsReceived.push('started');
		};
		const completedListener = () => {
			eventsReceived.push('completed');
		};
		const erroredListener = () => {
			eventsReceived.push('errored');
		};

		// Register listeners on the agent itself
		agentEventsAgent.addEventListener('started', startedListener);
		agentEventsAgent.addEventListener('completed', completedListener);
		agentEventsAgent.addEventListener('errored', erroredListener);

		if (input.shouldError) {
			throw new Error('Intentional error for event testing');
		}

		return {
			eventType: input.eventType,
			eventsReceived,
			success: true,
		};
	},
});

export default agentEventsAgent;
