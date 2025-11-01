import { type AgentContext, createAgent } from '@agentuity/runtime';

const agent = createAgent({
	handler: async (c: AgentContext) => {
		c.logger.info('Cron agent executed at', new Date().toISOString());
	},
});

export default agent;
