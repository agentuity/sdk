import { createAgent, type AgentContext } from '@agentuity/runtime';

const agent = createAgent('eval/no-schema', {
	handler: async (_c) => {
		console.log('no-schema agent executed');
	},
});

export default agent;
