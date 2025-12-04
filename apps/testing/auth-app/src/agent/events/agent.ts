import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const agent = createAgent({
	metadata: {
		name: 'Events Demo',
	},
	schema: {
		output: s.string(),
	},
	handler: async (c) => {
		console.log('session', c.sessionId);
		console.log('thread', c.thread.id, c.thread.state.get('last_hit'));
		c.thread.state.set('last_hit', new Date());
		return `Hello, the date is ${new Date()}`;
	},
});

export default agent;
