import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const sessionEventsAgent = createAgent('session-events', {
	description: 'Session and thread event listeners',
	schema: {
		input: s.object({
			operation: s.string(),
			testData: s.string().optional(),
		}),
		output: s.object({
			operation: s.string(),
			success: s.boolean(),
			message: s.string().optional(),
		}),
	},
	handler: async (ctx, input) => {
		const { operation, testData } = input;

		switch (operation) {
			case 'session-completed-listener': {
				let completedCalled = false;

				ctx.session.addEventListener('completed', () => {
					completedCalled = true;
				});

				// Use waitUntil to verify the event was called
				ctx.waitUntil(async () => {
					// Wait a bit for event to fire
					await new Promise((resolve) => setTimeout(resolve, 100));
					if (!completedCalled) {
						ctx.logger.warn('Session completed event was not called');
					}
				});

				return {
					operation,
					success: true,
					message: 'Session completed listener registered',
				};
			}

			case 'thread-destroyed-listener': {
				ctx.thread.addEventListener('destroyed', () => {
					ctx.logger.info('Thread destroyed event fired');
				});

				return {
					operation,
					success: true,
					message: 'Thread destroyed listener registered',
				};
			}

			case 'session-state-persistence': {
				// Set state that should only exist for this session
				ctx.session.state.set('testData', testData);

				return {
					operation,
					success: true,
					message: 'Session state set',
				};
			}

			default:
				throw new Error(`Unknown operation: ${operation}`);
		}
	},
});

export default sessionEventsAgent;
