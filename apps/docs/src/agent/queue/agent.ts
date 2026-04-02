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

function asObject(value: unknown): Record<string, unknown> | null {
	return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string | undefined {
	return typeof value === 'string' ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
	return typeof value === 'number' ? value : undefined;
}

function getQueueInfo(result: unknown, fallbackName: string) {
	const direct = asObject(result);
	const data = asObject(direct?.data);
	const queue = asObject(data?.queue);

	return {
		name: asString(direct?.name) ?? asString(queue?.name) ?? fallbackName,
		queueType:
			asString(direct?.queueType) ??
			asString(direct?.queue_type) ??
			asString(queue?.queueType) ??
			asString(queue?.queue_type) ??
			'worker',
	};
}

function getPublishedMessage(result: unknown) {
	const direct = asObject(result);
	const data = asObject(direct?.data);
	const message = asObject(data?.message);
	const id = asString(direct?.id) ?? asString(message?.id);

	if (!id) {
		return null;
	}

	const offset = asNumber(direct?.offset) ?? asNumber(message?.offset);
	const publishedAt =
		asString(direct?.publishedAt) ??
		asString(direct?.published_at) ??
		asString(message?.publishedAt) ??
		asString(message?.published_at);

	return {
		id,
		...(offset !== undefined ? { offset } : {}),
		...(publishedAt ? { publishedAt } : {}),
	};
}

const QUEUE_SETTINGS = {
	queueType: 'worker' as const,
	settings: {
		defaultMaxRetries: 2,
		defaultVisibilityTimeoutSeconds: 5,
	},
};

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
					const result = await ctx.queue.createQueue(queueName, QUEUE_SETTINGS);
					const queue = getQueueInfo(result, queueName);
					return {
						success: true,
						message: `Queue "${queue.name}" ready (${queue.queueType})`,
						data: queue,
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
					const result = await ctx.queue.publish(queueName, input.payload);
					const message = getPublishedMessage(result);
					return {
						success: true,
						message: message ? `Published message ${message.id}` : 'Message published',
						data: message ?? result,
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
