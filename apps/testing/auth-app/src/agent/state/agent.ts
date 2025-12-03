import { createAgent } from '@agentuity/runtime';
import { z } from 'zod';

const agent = createAgent({
	metadata: {
		name: 'State Test Agent',
		description: 'Tests thread and session state persistence',
	},
	schema: {
		input: z.object({
			action: z.enum(['save', 'read']),
			threadData: z.string().optional(),
			sessionData: z.string().optional(),
		}),
		output: z.object({
			success: z.boolean(),
			threadState: z.record(z.string(), z.unknown()).optional(),
			sessionState: z.record(z.string(), z.unknown()).optional(),
		}),
	},
	handler: async (c, { action, threadData, sessionData }) => {
		if (action === 'save') {
			// Save data to thread state
			if (threadData) {
				c.thread.state.set('testData', threadData);
				c.thread.state.set('savedAt', new Date().toISOString());
				c.thread.state.set(
					'requestCount',
					((c.thread.state.get('requestCount') as number) || 0) + 1
				);
			}

			// Save data to session state
			if (sessionData) {
				c.session.state.set('sessionData', sessionData);
				c.session.state.set('sessionStartedAt', new Date().toISOString());
			}

			return {
				success: true,
				threadState: Object.fromEntries(c.thread.state),
				sessionState: Object.fromEntries(c.session.state),
			};
		} else {
			// Read current state
			return {
				success: true,
				threadState: Object.fromEntries(c.thread.state),
				sessionState: Object.fromEntries(c.session.state),
			};
		}
	},
});

export default agent;
