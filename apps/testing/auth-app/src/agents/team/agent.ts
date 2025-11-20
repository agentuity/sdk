import { type AgentContext, createAgent } from '@agentuity/runtime';
import { z } from 'zod';

const agent = createAgent({
	metadata: {
		name: 'SubAgents Demo',
	},
	schema: {
		input: z.object({
			action: z.enum(['info', 'count']),
		}),
		output: z.object({
			message: z.string(),
			timestamp: z.string(),
		}),
	},
	handler: async (ctx: AgentContext, { action }) => {
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
