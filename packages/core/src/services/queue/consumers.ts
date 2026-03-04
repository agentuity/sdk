import { z } from 'zod';
import { type APIClient, APIResponseSchema } from '../api.ts';
import {
	type Consumer,
	ConsumerSchema,
	type QueueApiOptions,
} from './types.ts';
import { buildQueueHeaders, QueueError, queueApiPath, withQueueErrorHandling } from './util.ts';
import { validateQueueName } from './validation.ts';

export const ConsumersListResponseSchema = APIResponseSchema(
	z.object({
		consumers: z.array(ConsumerSchema),
		total: z.number(),
	})
);

/**
 * List consumers for a queue.
 *
 * Returns active WebSocket consumers and recently disconnected durable consumers.
 *
 * @param client - The API client instance
 * @param queueName - The name of the queue
 * @param options - Optional API options (e.g., orgId for CLI-authenticated requests)
 * @returns Array of consumers
 * @throws {QueueNotFoundError} If the queue does not exist
 * @throws {QueueError} If the API request fails
 *
 * @example
 * ```typescript
 * const consumers = await listConsumers(client, 'order-processing');
 * for (const consumer of consumers) {
 *   const status = consumer.disconnected_at ? 'disconnected' : 'connected';
 *   console.log(`Consumer ${consumer.id}: ${status} (durable: ${consumer.durable})`);
 * }
 * ```
 */
export async function listConsumers(
	client: APIClient,
	queueName: string,
	options?: QueueApiOptions
): Promise<Consumer[]> {
	validateQueueName(queueName);
	const url = queueApiPath('consumers/list', queueName);
	const resp = await withQueueErrorHandling(
		() =>
			client.get(url, ConsumersListResponseSchema, undefined, buildQueueHeaders(options?.orgId)),
		{ queueName }
	);

	if (resp.success) {
		return resp.data.consumers;
	}

	throw new QueueError({
		queueName,
		message: resp.message || 'Failed to list consumers',
	});
}
