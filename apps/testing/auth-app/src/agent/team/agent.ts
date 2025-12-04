import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const agent = createAgent({
	metadata: {
		name: 'SubAgents Demo',
	},
	schema: {
		input: s.object({
			action: s.enum(['info', 'count']),
		}),
		output: s.object({
			message: s.string(),
			timestamp: s.string(),
		}),
	},
	handler: async (ctx, { action }) => {
		const timestamp = new Date().toISOString();

		if (action === 'info') {
			return {
				message: 'Team parent agent - manages members and tasks via subagents',
				timestamp,
			};
		}

		return {
			message: 'Team has 2 subagents: members and tasks',
			timestamp,
		};
	},
});

export default agent;
