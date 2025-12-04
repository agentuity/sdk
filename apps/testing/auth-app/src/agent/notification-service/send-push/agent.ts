import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const agent = createAgent({
	metadata: {
		name: 'Send Push Notification (Child)',
		description: 'Subagent with hyphenated child name (notification-service.send-push)',
	},
	schema: {
		input: s.object({ device: s.string(), message: s.string() }),
		output: s.string(),
	},
	handler: async (_c, { device, message }) => {
		return `Push notification sent to ${device}: ${message}`;
	},
});

export default agent;
