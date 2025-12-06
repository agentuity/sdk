import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const waitUntilAgent = createAgent('lifecycle-waituntil', {
	description: 'WaitUntil background task testing',
	schema: {
		input: s.object({
			operation: s.string(),
			taskData: s.string().optional(),
			taskCount: s.number().optional(),
			shouldError: s.boolean().optional(),
		}),
		output: s.object({
			operation: s.string(),
			success: s.boolean(),
			message: s.string().optional(),
			taskScheduled: s.boolean().optional(),
		}),
	},
	handler: async (ctx, input) => {
		const { operation, taskData, taskCount, shouldError } = input;

		switch (operation) {
			case 'schedule-task': {
				// Schedule a background task
				ctx.waitUntil(async () => {
					// Simulate background work
					await new Promise((resolve) => setTimeout(resolve, 10));
					ctx.logger.info('Background task completed', { taskData });
				});

				return {
					operation,
					success: true,
					message: 'Background task scheduled',
					taskScheduled: true,
				};
			}

			case 'schedule-multiple': {
				const count = taskCount || 3;

				// Schedule multiple background tasks
				for (let i = 0; i < count; i++) {
					ctx.waitUntil(async () => {
						await new Promise((resolve) => setTimeout(resolve, 10));
						ctx.logger.info(`Background task ${i + 1} completed`);
					});
				}

				return {
					operation,
					success: true,
					message: `Scheduled ${count} background tasks`,
					taskScheduled: true,
				};
			}

			case 'schedule-with-error': {
				// Schedule a task that will throw an error
				ctx.waitUntil(async () => {
					if (shouldError) {
						throw new Error('Background task error');
					}
					ctx.logger.info('Background task completed without error');
				});

				return {
					operation,
					success: true,
					message: 'Background task with potential error scheduled',
					taskScheduled: true,
				};
			}

			case 'schedule-promise': {
				// Schedule a task using Promise directly
				ctx.waitUntil(
					new Promise<void>((resolve) => {
						setTimeout(() => {
							ctx.logger.info('Promise-based task completed');
							resolve();
						}, 10);
					})
				);

				return {
					operation,
					success: true,
					message: 'Promise-based task scheduled',
					taskScheduled: true,
				};
			}

			case 'schedule-sync-function': {
				// Schedule a synchronous function
				ctx.waitUntil(() => {
					ctx.logger.info('Synchronous task completed');
				});

				return {
					operation,
					success: true,
					message: 'Synchronous task scheduled',
					taskScheduled: true,
				};
			}

			default:
				throw new Error(`Unknown operation: ${operation}`);
		}
	},
});

export default waitUntilAgent;
