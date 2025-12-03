import { type AgentContext, createAgent } from '@agentuity/runtime';

const agent = createAgent({
	metadata: {
		name: 'Cron Agent',
		description: 'Agent for testing cron functionality',
	},
	handler: async (c) => {
		c.logger.info('Cron agent executed at', new Date().toISOString());
	},
});

export default agent;
