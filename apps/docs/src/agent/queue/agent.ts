/**
 * Message Queue Agent
 *
 * Demonstrates queue operations for the publish side of message queues.
 * Agents use ctx.queue for creating queues and publishing messages.
 * Consume-side operations (receive, ack, nack, DLQ) use the server API
 * client directly — see src/api/queue/route.ts.
 *
 * Operations shown:
 * - ctx.queue.createQueue(name, params) - Create a queue with settings
 * - ctx.queue.publish(name, payload, params) - Publish a message
 *
 * Docs: https://agentuity.dev/Services/Queues
 */
import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const DEFAULT_QUEUE_NAME = 'explorer-demo';

const InputSchema = s.union(
	s.object({
		action: s.literal('setup'),
		queueName: s.optional(s.string()),
	}),
	s.object({
		action: s.literal('publish'),
		payload: s.record(s.string(), s.unknown()),
		queueName: s.optional(s.string()),
	})
);

const agent = createAgent('queue', {
	description: 'Demonstrates message queue publish operations',
	schema: {
		input: InputSchema,
		output: s.object({
			success: s.boolean(),
			message: s.string(),
			data: s.optional(s.unknown()),
		}),
	},
	handler: async (ctx, input) => {
		const queueName = input.queueName ?? DEFAULT_QUEUE_NAME;

		switch (input.action) {
			case 'setup': {
				try {
					const result = await ctx.queue.createQueue(queueName, {
						queueType: 'worker',
						settings: {
							defaultMaxRetries: 2,
							defaultVisibilityTimeoutSeconds: 5,
						},
					});
					return {
						success: true,
						message: `Queue "${result.name}" ready (${result.queueType})`,
						data: result,
					};
				} catch (err) {
					const msg = err instanceof Error ? err.message : String(err);
					// Queue may already exist — treat as success
					if (msg.includes('already exists') || msg.includes('conflict')) {
						return {
							success: true,
							message: `Queue "${queueName}" already exists`,
						};
					}
					return { success: false, message: msg };
				}
			}

			case 'publish': {
				try {
					const result = await ctx.queue.publish(queueName, input.payload, { sync: true });
					return {
						success: true,
						message: `Published message ${result.id}`,
						data: result,
					};
				} catch (err) {
					const msg = err instanceof Error ? err.message : String(err);
					return { success: false, message: msg };
				}
			}

			default:
				throw new Error(`Unknown action: ${(input as { action: string }).action}`);
		}
	},
});

export default agent;
