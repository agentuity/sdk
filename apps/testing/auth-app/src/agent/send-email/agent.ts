import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const agent = createAgent({
	metadata: {
		name: 'Send Email (Hyphenated)',
		description: 'Test agent with hyphenated name (send-email)',
	},
	schema: {
		input: s.object({ to: s.string(), subject: s.string() }),
		output: s.string(),
	},
	handler: async (_c, { to, subject }) => {
		return `Email sent to ${to} with subject: ${subject}`;
	},
});

export default agent;
