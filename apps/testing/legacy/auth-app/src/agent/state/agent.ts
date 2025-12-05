import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const agent = createAgent('state', {
	description: 'Tests thread and session state persistence',
	schema: {
		input: s.object({
			action: s.enum(['save', 'read']),
			threadData: s.string().optional(),
			sessionData: s.string().optional(),
		}),
		output: s.object({
			success: s.boolean(),
			threadState: s.record(s.string(), s.unknown()).optional(),
			sessionState: s.record(s.string(), s.unknown()).optional(),
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
