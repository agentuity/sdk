import { z } from 'zod';
import { type APIClient, APIResponseSchema, APIResponseSchemaNoData } from '../api.ts';
import {
	type DeadLetterMessage,
	DeadLetterMessageSchema,
	type ListDlqRequest,
	type Message,
	MessageSchema,
	type QueueApiOptions,
} from './types.ts';
import {
	buildQueueHeaders,
	QueueError,
	queueApiPath,
	queueApiPathWithQuery,
	withQueueErrorHandling,
} from './util.ts';
import { validateLimit, validateMessageId, validateOffset, validateQueueName } from './validation.ts';

export const DlqListResponseSchema = APIResponseSchema(
	z.object({
		messages: z.array(DeadLetterMessageSchema),
		total: z.number().optional(),
	})
);
export const ReplayDlqResponseSchema = APIResponseSchema(z.object({ message: MessageSchema }));
export const DeleteDlqResponseSchema = APIResponseSchemaNoData();

/**
 * List messages in the dead letter queue.
 *
 * Retrieves messages that failed processing after exhausting all retries.
 * These messages can be inspected, replayed back to the main queue, or deleted.
 *
 * @param client - The API client instance
 * @param queueName - The name of the queue whose DLQ to list
 * @param params - Optional pagination parameters (limit, offset)
 * @returns Object containing dead letter messages and optional total count
 * @throws {QueueValidationError} If validation fails (invalid queue name, limit, or offset)
 * @throws {QueueNotFoundError} If the queue does not exist
 * @throws {QueueError} If the API request fails
 *
 * @example
 * ```typescript
 * // List first 10 dead letter messages
 * const result = await listDeadLetterMessages(client, 'order-queue', { limit: 10 });
 * for (const msg of result.messages) {
 *   console.log(`Failed message ${msg.id}: ${msg.failure_reason}`);
 *   console.log(`Attempts: ${msg.delivery_attempts}, Moved at: ${msg.moved_at}`);
 * }
 * ```
 */
export async function listDeadLetterMessages(
	client: APIClient,
	queueName: string,
	params?: ListDlqRequest,
	options?: QueueApiOptions
): Promise<{ messages: DeadLetterMessage[]; total?: number }> {
	validateQueueName(queueName);
	if (params?.limit !== undefined) {
		validateLimit(params.limit);
	}
	if (params?.offset !== undefined) {
		validateOffset(params.offset);
	}

	const searchParams = new URLSearchParams();
	if (params?.limit !== undefined) {
		searchParams.set('limit', String(params.limit));
	}
	if (params?.offset !== undefined) {
		searchParams.set('offset', String(params.offset));
	}

	const queryString = searchParams.toString();
	const url = queueApiPathWithQuery('dlq/list', queryString || undefined, queueName);
	const resp = await withQueueErrorHandling(
		() => client.get(url, DlqListResponseSchema, undefined, buildQueueHeaders(options?.orgId)),
		{ queueName }
	);

	if (resp.success) {
		return { messages: resp.data.messages, total: resp.data.total };
	}

	throw new QueueError({
		queueName,
		message: resp.message || 'Failed to list dead letter messages',
	});
}

/**
 * Replay a dead letter message back to the main queue.
 *
 * Moves a message from the dead letter queue back to the main queue for
 * reprocessing. The message state is reset to pending and retry count is
 * preserved. Use this after fixing the underlying issue that caused the failure.
 *
 * @param client - The API client instance
 * @param queueName - The name of the queue
 * @param messageId - The message ID to replay (prefixed with msg_)
 * @returns The replayed message with updated state
 * @throws {QueueValidationError} If validation fails (invalid queue name or message ID)
 * @throws {MessageNotFoundError} If the message does not exist in the DLQ
 * @throws {QueueNotFoundError} If the queue does not exist
 * @throws {QueueError} If the API request fails
 *
 * @example
 * ```typescript
 * // Replay a failed message after fixing the bug
 * const message = await replayDeadLetterMessage(client, 'order-queue', 'msg_abc123');
 * console.log(`Replayed message ${message.id}, now in state: ${message.state}`);
 * ```
 */
export async function replayDeadLetterMessage(
	client: APIClient,
	queueName: string,
	messageId: string,
	options?: QueueApiOptions
): Promise<Message> {
	validateQueueName(queueName);
	validateMessageId(messageId);

	const url = queueApiPath('dlq/replay', queueName, messageId);
	const resp = await withQueueErrorHandling(
		() =>
			client.post(
				url,
				undefined,
				ReplayDlqResponseSchema,
				undefined,
				undefined,
				buildQueueHeaders(options?.orgId)
			),
		{ queueName, messageId }
	);

	if (resp.success) {
		return resp.data.message;
	}

	throw new QueueError({
		queueName,
		message: resp.message || 'Failed to replay dead letter message',
	});
}

/**
 * Purge all messages from a dead letter queue.
 *
 * Permanently deletes all messages in the dead letter queue. This operation
 * cannot be undone. Use with caution - consider reviewing or exporting
 * messages before purging.
 *
 * @param client - The API client instance
 * @param queueName - The name of the queue whose DLQ to purge
 * @returns void
 * @throws {QueueValidationError} If validation fails (invalid queue name)
 * @throws {QueueNotFoundError} If the queue does not exist
 * @throws {QueueError} If the API request fails
 *
 * @example
 * ```typescript
 * // Purge all dead letter messages after investigation
 * await purgeDeadLetter(client, 'order-queue');
 * console.log('All dead letter messages have been deleted');
 * ```
 */
export async function purgeDeadLetter(
	client: APIClient,
	queueName: string,
	options?: QueueApiOptions
): Promise<void> {
	validateQueueName(queueName);
	const url = queueApiPath('dlq/purge', queueName);
	const resp = await withQueueErrorHandling(
		() =>
			client.delete(url, DeleteDlqResponseSchema, undefined, buildQueueHeaders(options?.orgId)),
		{ queueName }
	);

	if (resp.success) {
		return;
	}

	throw new QueueError({
		queueName,
		message: resp.message || 'Failed to purge dead letter queue',
	});
}

/**
 * Delete a specific message from the dead letter queue.
 *
 * Permanently removes a single message from the dead letter queue.
 * Use this when you've determined that a specific failed message
 * should not be retried and can be discarded.
 *
 * @param client - The API client instance
 * @param queueName - The name of the queue
 * @param messageId - The message ID to delete (prefixed with msg_)
 * @returns void
 * @throws {QueueValidationError} If validation fails (invalid queue name or message ID)
 * @throws {MessageNotFoundError} If the message does not exist in the DLQ
 * @throws {QueueError} If the API request fails
 *
 * @example
 * ```typescript
 * // Delete a message that cannot be recovered
 * await deleteDeadLetterMessage(client, 'order-queue', 'msg_abc123');
 * console.log('Dead letter message deleted');
 * ```
 */
export async function deleteDeadLetterMessage(
	client: APIClient,
	queueName: string,
	messageId: string,
	options?: QueueApiOptions
): Promise<void> {
	validateQueueName(queueName);
	validateMessageId(messageId);

	const url = queueApiPath('dlq/delete', queueName, messageId);
	const resp = await withQueueErrorHandling(
		() =>
			client.delete(
				url,
				DeleteDlqResponseSchema,
				undefined,
				buildQueueHeaders(options?.orgId)
			),
		{ queueName, messageId }
	);

	if (resp.success) {
		return;
	}

	throw new QueueError({
		queueName,
		message: resp.message || 'Failed to delete dead letter message',
	});
}
