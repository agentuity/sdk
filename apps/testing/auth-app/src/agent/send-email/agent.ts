import { createAgent } from '@agentuity/runtime';
import { z } from 'zod';

const agent = createAgent({
	metadata: {
		name: 'Send Email (Hyphenated)',
		description: 'Test agent with hyphenated name (send-email)',
	},
	schema: {
		input: z.object({ to: z.string(), subject: z.string() }),
		output: z.string(),
	},
	handler: async (_c, { to, subject }) => {
		return `Email sent to ${to} with subject: ${subject}`;
	},
});

export default agent;
