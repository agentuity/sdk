import { createAgent } from '@agentuity/runtime';
import { z } from 'zod';

const agent = createAgent({
	metadata: {
		name: 'Send Push Notification (Child)',
		description: 'Subagent with hyphenated child name (notification-service.send-push)',
	},
	schema: {
		input: z.object({ device: z.string(), message: z.string() }),
		output: z.string(),
	},
	handler: async (_c, { device, message }) => {
		return `Push notification sent to ${device}: ${message}`;
	},
});

export default agent;
