import { type AgentContext, createAgent } from '@agentuity/server';

const agent = createAgent({
	handler: (_c: AgentContext) => {
		setTimeout(() => console.log('agent ran'), 3_000);
	},
});

export default agent;
