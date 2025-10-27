import { type AgentContext, createAgent } from '@agentuity/server';

const agent = createAgent({
	handler: async (_c: AgentContext) => {
		console.log('Cron agent executed at', new Date().toISOString());
	},
});

export default agent;
