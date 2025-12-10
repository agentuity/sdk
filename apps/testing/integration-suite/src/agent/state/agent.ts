/**
 * State Persistence Agent
 *
 * Tests thread and session state persistence.
 * Used for HTTP client tests to verify state across requests.
 */

import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const statePersistenceAgent = createAgent('state', {
	description: 'Test thread and session state persistence across requests',
	schema: {
		input: s.object({
			action: s.string(), // 'save', 'read', 'ids'
			threadData: s.string().optional(), // Data to save in thread state
			sessionData: s.string().optional(), // Data to save in session state
		}),
		output: s.object({
			action: s.string(),
			success: s.boolean(),
			sessionId: s.string().optional(),
			threadId: s.string().optional(),
			threadState: s.any().optional(), // Thread state contents
			sessionState: s.any().optional(), // Session state contents
		}),
	},
	handler: async (ctx, input) => {
		const { action, threadData, sessionData } = input;

		switch (action) {
			case 'save': {
				// Save to thread state (persists across requests)
				if (threadData) {
					ctx.thread.state.set('testData', threadData);

					// Increment request counter in thread state
					const requestCount = (ctx.thread.state.get('requestCount') as number) || 0;
					ctx.thread.state.set('requestCount', requestCount + 1);
				}

				// Save to session state (request-scoped)
				if (sessionData) {
					ctx.session.state.set('sessionData', sessionData);
				}

				return {
					action,
					success: true,
					sessionId: ctx.session.id,
					threadId: ctx.thread.id,
					threadState: {
						testData: ctx.thread.state.get('testData'),
						requestCount: ctx.thread.state.get('requestCount'),
					},
					sessionState: {
						sessionData: ctx.session.state.get('sessionData'),
					},
				};
			}

			case 'read': {
				// Read from thread state
				const testData = ctx.thread.state.get('testData');
				const requestCount = ctx.thread.state.get('requestCount');

				// Read from session state (should be empty in new request)
				const sessionData = ctx.session.state.get('sessionData');

				return {
					action,
					success: true,
					sessionId: ctx.session.id,
					threadId: ctx.thread.id,
					threadState: {
						testData,
						requestCount,
					},
					sessionState: {
						sessionData,
					},
				};
			}

			case 'ids': {
				// Just return IDs without modifying state
				return {
					action,
					success: true,
					sessionId: ctx.session.id,
					threadId: ctx.thread.id,
				};
			}

			default:
				throw new Error(`Unknown action: ${action}`);
		}
	},
});

export default statePersistenceAgent;
