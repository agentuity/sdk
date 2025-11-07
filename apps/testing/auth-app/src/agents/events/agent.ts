import { type AgentContext, createAgent } from '@agentuity/runtime';
import { z } from 'zod';

const agent = createAgent({
	schema: {
		output: z.string(),
	},
	handler: async (c: AgentContext) => {
		console.log('session', c.sessionId);
		console.log('thread', c.thread.id, c.thread.state.get('last_hit'));
		c.thread.state.set('last_hit', new Date());
		return `Hello, the date is ${new Date()}`;
	},
});

export default agent;
