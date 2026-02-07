import { z } from 'zod';
import { type APIClient, APIResponseSchema, APIResponseSchemaNoData } from '../api';
import {
	type BatchPublishMessagesRequest,
	BatchPublishMessagesRequestSchema,
	type ConsumeMessagesRequest,
	type ListMessagesRequest,
	type Message,
	MessageSchema,
	type PublishMessageRequest,
	PublishMessageRequestSchema,
	type QueueApiOptions,
} from './types';
import {
	buildQueueHeaders,
	MessageNotFoundError,
	QueueError,
	QueueNotFoundError,
	queueApiPath,
	queueApiPathWithQuery,
} from './util';
import {
	validateBatchSize,
	validateIdempotencyKey,
	validateLimit,
	validateMessageId,
	validateOffset,
	validatePartitionKey,
	validatePayload,
	validateQueueName,
	validateTTL,
} from './validation';

export const MessageResponseSchema = APIResponseSchema(z.object({ message: MessageSchema }));
export const MessagesListResponseSchema = APIResponseSchema(
	z.object({
		messages: z.array(MessageSchema),
		total: z.number().optional(),
	})
);
export const BatchPublishResponseSchema = APIResponseSchema(
	z.object({
		messages: z.array(MessageSchema),
		failed: z.array(z.number()).optional(),
	})
);
export const DeleteMessageResponseSchema = APIResponseSchemaNoData();
export const AckNackResponseSchema = APIResponseSchemaNoData();
export const OffsetResponseSchema = APIResponseSchema(z.object({ offset: z.number() }));
export const ReceiveResponseSchema = APIResponseSchema(
	z.object({
		message: MessageSchema.nullable(),
	})
);

/**
 * Publish a message to a queue.
 *
 * Publishes a single message to the specified queue. The message will be assigned
 * a unique ID and offset.
 *
 * @param client - The API client instance
 * @param queueName - The name of the queue to publish to
 * @param params - Message parameters including payload
 * @returns The published message with assigned ID and offset
 * @throws {QueueValidationError} If validation fails
 * @throws {QueueNotFoundError} If the queue does not exist
 * @throws {QueueError} If the API request fails
 *
 * @example
 * ```typescript
 * const message = await publishMessage(client, 'order-queue', {
 *   payload: { orderId: 123, action: 'process' },
 *   metadata: { priority: 'high' },
 *   idempotency_key: 'order-123-process',
 * });
 * console.log(`Published message ${message.id} at offset ${message.offset}`);
 * ```
 */
export async function publishMessage(
	client: APIClient,
	queueName: string,
	params: PublishMessageRequest,
	options?: QueueApiOptions
): Promise<Message> {
	// Validate before sending to API
	validateQueueName(queueName);
	validatePayload(params.payload);
	if (params.partition_key) {
		validatePartitionKey(params.partition_key);
	}
	if (params.idempotency_key) {
		validateIdempotencyKey(params.idempotency_key);
	}
	if (params.ttl_seconds !== undefined) {
		validateTTL(params.ttl_seconds);
	}

	const url = options?.sync
		? queueApiPathWithQuery('messages/publish', 'sync=true', queueName)
		: queueApiPath('messages/publish', queueName);
	const resp = await client.post(
		url,
		params,
		MessageResponseSchema,
		PublishMessageRequestSchema,
		undefined,
		buildQueueHeaders(options?.orgId)
	);

	if (resp.success) {
		return resp.data.message;
	}

	if (resp.message?.includes('not found')) {
		throw new QueueNotFoundError({
			queueName,
			message: resp.message,
		});
	}

	throw new QueueError({
		queueName,
		message: resp.message || 'Failed to publish message',
	});
}

/**
 * Batch publish multiple messages to a queue.
 *
 * Publishes up to 1000 messages in a single API call. This is more efficient
 * than publishing messages individually.
 *
 * @param client - The API client instance
 * @param queueName - The name of the queue to publish to
 * @param messages - Array of message parameters (max 1000)
 * @returns Object containing the published messages and optionally failed indices
 * @throws {QueueValidationError} If validation fails
 * @throws {QueueNotFoundError} If the queue does not exist
 * @throws {QueueError} If the API request fails
 *
 * @example
 * ```typescript
 * const result = await batchPublishMessages(client, 'order-queue', [
 *   { payload: { orderId: 1 } },
 *   { payload: { orderId: 2 } },
 *   { payload: { orderId: 3 } },
 * ]);
 * console.log(`Published ${result.messages.length} messages`);
 * ```
 */
export async function batchPublishMessages(
	client: APIClient,
	queueName: string,
	messages: BatchPublishMessagesRequest['messages'],
	options?: QueueApiOptions
): Promise<{ messages: Message[]; failed?: number[] }> {
	// Validate before sending to API
	validateQueueName(queueName);
	validateBatchSize(messages.length);
	for (const msg of messages) {
		validatePayload(msg.payload);
		if (msg.partition_key) {
			validatePartitionKey(msg.partition_key);
		}
		if (msg.idempotency_key) {
			validateIdempotencyKey(msg.idempotency_key);
		}
		if (msg.ttl_seconds !== undefined) {
			validateTTL(msg.ttl_seconds);
		}
	}

	const url = queueApiPath('messages/batch', queueName);
	const resp = await client.post(
		url,
		{ messages },
		BatchPublishResponseSchema,
		BatchPublishMessagesRequestSchema,
		undefined,
		buildQueueHeaders(options?.orgId)
	);

	if (resp.success) {
		return { messages: resp.data.messages, failed: resp.data.failed };
	}

	if (resp.message?.includes('not found')) {
		throw new QueueNotFoundError({
			queueName,
			message: resp.message,
		});
	}

	throw new QueueError({
		queueName,
		message: resp.message || 'Failed to batch publish messages',
	});
}

/**
 * Get a message by ID.
 *
 * Retrieves a specific message from a queue by its message ID.
 *
 * @param client - The API client instance
 * @param queueName - The name of the queue
 * @param messageId - The message ID (prefixed with msg_)
 * @returns The message details
 * @throws {QueueValidationError} If validation fails
 * @throws {MessageNotFoundError} If the message does not exist
 * @throws {QueueNotFoundError} If the queue does not exist
 * @throws {QueueError} If the API request fails
 *
 * @example
 * ```typescript
 * const message = await getMessage(client, 'order-queue', 'msg_abc123');
 * console.log(`Message state: ${message.state}`);
 * ```
 */
export async function getMessage(
	client: APIClient,
	queueName: string,
	messageId: string,
	options?: QueueApiOptions
): Promise<Message> {
	validateQueueName(queueName);
	validateMessageId(messageId);

	const url = queueApiPath('messages/get', queueName, messageId);
	const resp = await client.get(
		url,
		MessageResponseSchema,
		undefined,
		buildQueueHeaders(options?.orgId)
	);

	if (resp.success) {
		return resp.data.message;
	}

	if (resp.message?.includes('message') && resp.message?.includes('not found')) {
		throw new MessageNotFoundError({
			queueName,
			messageId,
			message: resp.message,
		});
	}

	if (resp.message?.includes('queue') && resp.message?.includes('not found')) {
		throw new QueueNotFoundError({
			queueName,
			message: resp.message,
		});
	}

	throw new QueueError({
		queueName,
		message: resp.message || 'Failed to get message',
	});
}

/**
 * Get a message by its offset position.
 *
 * Retrieves a specific message from a queue by its offset (sequential position).
 * Useful for log-style consumption where you track position by offset.
 *
 * @param client - The API client instance
 * @param queueName - The name of the queue
 * @param offset - The message offset (0-based sequential position)
 * @returns The message at the specified offset
 * @throws {QueueValidationError} If validation fails
 * @throws {MessageNotFoundError} If no message exists at the offset
 * @throws {QueueError} If the API request fails
 *
 * @example
 * ```typescript
 * const message = await getMessageByOffset(client, 'events', 42);
 * console.log(`Message at offset 42: ${message.id}`);
 * ```
 */
export async function getMessageByOffset(
	client: APIClient,
	queueName: string,
	offset: number,
	options?: QueueApiOptions
): Promise<Message> {
	validateQueueName(queueName);
	validateOffset(offset);

	const url = queueApiPath('messages/offset', queueName, String(offset));
	const resp = await client.get(
		url,
		MessageResponseSchema,
		undefined,
		buildQueueHeaders(options?.orgId)
	);

	if (resp.success) {
		return resp.data.message;
	}

	if (resp.message?.includes('not found')) {
		throw new MessageNotFoundError({
			queueName,
			messageId: `offset:${offset}`,
			message: resp.message,
		});
	}

	throw new QueueError({
		queueName,
		message: resp.message || 'Failed to get message by offset',
	});
}

/**
 * List messages in a queue.
 *
 * Retrieves messages from a queue with optional filtering and pagination.
 * Supports filtering by state and pagination via limit/offset.
 *
 * @param client - The API client instance
 * @param queueName - The name of the queue
 * @param params - Optional filtering and pagination parameters
 * @param params.limit - Maximum number of messages to return (1-1000)
 * @param params.offset - Starting offset for pagination
 * @param params.state - Filter by message state (pending, processing, completed, failed, dead)
 * @returns Object containing messages array and optional total count
 * @throws {QueueValidationError} If validation fails
 * @throws {QueueNotFoundError} If the queue does not exist
 * @throws {QueueError} If the API request fails
 *
 * @example
 * ```typescript
 * // List first 10 pending messages
 * const result = await listMessages(client, 'order-queue', {
 *   limit: 10,
 *   state: 'pending',
 * });
 * console.log(`Found ${result.messages.length} pending messages`);
 * ```
 */
export async function listMessages(
	client: APIClient,
	queueName: string,
	params?: ListMessagesRequest,
	options?: QueueApiOptions
): Promise<{ messages: Message[]; total?: number }> {
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
	if (params?.state !== undefined) {
		searchParams.set('state', params.state);
	}

	const queryString = searchParams.toString();
	const url = queueApiPathWithQuery('messages/list', queryString || undefined, queueName);
	const resp = await client.get(
		url,
		MessagesListResponseSchema,
		undefined,
		buildQueueHeaders(options?.orgId)
	);

	if (resp.success) {
		return { messages: resp.data.messages, total: resp.data.total };
	}

	if (resp.message?.includes('not found')) {
		throw new QueueNotFoundError({
			queueName,
			message: resp.message,
		});
	}

	throw new QueueError({
		queueName,
		message: resp.message || 'Failed to list messages',
	});
}

/**
 * Delete a message from a queue.
 *
 * Permanently removes a message from the queue. This operation cannot be undone.
 *
 * @param client - The API client instance
 * @param queueName - The name of the queue
 * @param messageId - The message ID to delete (prefixed with msg_)
 * @returns void
 * @throws {QueueValidationError} If validation fails
 * @throws {MessageNotFoundError} If the message does not exist
 * @throws {QueueError} If the API request fails
 *
 * @example
 * ```typescript
 * await deleteMessage(client, 'order-queue', 'msg_abc123');
 * console.log('Message deleted');
 * ```
 */
export async function deleteMessage(
	client: APIClient,
	queueName: string,
	messageId: string,
	options?: QueueApiOptions
): Promise<void> {
	validateQueueName(queueName);
	validateMessageId(messageId);

	const url = queueApiPath('messages/delete', queueName, messageId);
	const resp = await client.delete(
		url,
		DeleteMessageResponseSchema,
		undefined,
		buildQueueHeaders(options?.orgId)
	);

	if (resp.success) {
		return;
	}

	if (resp.message?.includes('message') && resp.message?.includes('not found')) {
		throw new MessageNotFoundError({
			queueName,
			messageId,
			message: resp.message,
		});
	}

	throw new QueueError({
		queueName,
		message: resp.message || 'Failed to delete message',
	});
}

/**
 * Replay a message.
 *
 * Re-queues a previously processed message for reprocessing. The message
 * is reset to pending state and will be delivered again to consumers.
 * Useful for retrying failed messages or reprocessing historical data.
 *
 * @param client - The API client instance
 * @param queueName - The name of the queue
 * @param messageId - The message ID to replay (prefixed with msg_)
 * @returns The replayed message with updated state
 * @throws {QueueValidationError} If validation fails
 * @throws {MessageNotFoundError} If the message does not exist
 * @throws {QueueError} If the API request fails
 *
 * @example
 * ```typescript
 * const message = await replayMessage(client, 'order-queue', 'msg_abc123');
 * console.log(`Message replayed, new state: ${message.state}`);
 * ```
 */
export async function replayMessage(
	client: APIClient,
	queueName: string,
	messageId: string,
	options?: QueueApiOptions
): Promise<Message> {
	validateQueueName(queueName);
	validateMessageId(messageId);

	const url = queueApiPath('messages/replay', queueName, messageId);
	const resp = await client.post(
		url,
		undefined,
		MessageResponseSchema,
		undefined,
		undefined,
		buildQueueHeaders(options?.orgId)
	);

	if (resp.success) {
		return resp.data.message;
	}

	if (resp.message?.includes('message') && resp.message?.includes('not found')) {
		throw new MessageNotFoundError({
			queueName,
			messageId,
			message: resp.message,
		});
	}

	throw new QueueError({
		queueName,
		message: resp.message || 'Failed to replay message',
	});
}

/**
 * Consume messages from a queue starting at an offset.
 *
 * Retrieves messages for log-style consumption, starting from the specified
 * offset. Unlike receive/ack flow, this does not mark messages as processing.
 * Ideal for event sourcing or fan-out patterns where multiple consumers
 * read the same messages.
 *
 * @param client - The API client instance
 * @param queueName - The name of the queue
 * @param params - Consume parameters
 * @param params.offset - Starting offset (0-based)
 * @param params.limit - Maximum messages to return (optional, 1-1000)
 * @returns Object containing the messages array
 * @throws {QueueValidationError} If validation fails
 * @throws {QueueNotFoundError} If the queue does not exist
 * @throws {QueueError} If the API request fails
 *
 * @example
 * ```typescript
 * // Consume 100 messages starting at offset 500
 * const result = await consumeMessages(client, 'events', {
 *   offset: 500,
 *   limit: 100,
 * });
 * for (const msg of result.messages) {
 *   console.log(`Processing event at offset ${msg.offset}`);
 * }
 * ```
 */
export async function consumeMessages(
	client: APIClient,
	queueName: string,
	params: ConsumeMessagesRequest,
	options?: QueueApiOptions
): Promise<{ messages: Message[] }> {
	validateQueueName(queueName);
	validateOffset(params.offset);
	if (params.limit !== undefined) {
		validateLimit(params.limit);
	}

	const searchParams = new URLSearchParams();
	searchParams.set('offset', String(params.offset));
	if (params.limit !== undefined) {
		searchParams.set('limit', String(params.limit));
	}

	const url = queueApiPathWithQuery('consume', searchParams.toString(), queueName);
	const resp = await client.get(
		url,
		MessagesListResponseSchema,
		undefined,
		buildQueueHeaders(options?.orgId)
	);

	if (resp.success) {
		return { messages: resp.data.messages };
	}

	if (resp.message?.includes('not found')) {
		throw new QueueNotFoundError({
			queueName,
			message: resp.message,
		});
	}

	throw new QueueError({
		queueName,
		message: resp.message || 'Failed to consume messages',
	});
}

/**
 * Get the head offset of a queue.
 *
 * Returns the offset of the oldest (first) message in the queue.
 * Useful for determining the starting point for log-style consumption.
 *
 * @param client - The API client instance
 * @param queueName - The name of the queue
 * @returns The head offset (oldest message position)
 * @throws {QueueValidationError} If validation fails
 * @throws {QueueNotFoundError} If the queue does not exist
 * @throws {QueueError} If the API request fails
 *
 * @example
 * ```typescript
 * const head = await getQueueHead(client, 'events');
 * console.log(`Queue starts at offset ${head}`);
 * ```
 */
export async function getQueueHead(
	client: APIClient,
	queueName: string,
	options?: QueueApiOptions
): Promise<number> {
	validateQueueName(queueName);
	const url = queueApiPath('head', queueName);
	const resp = await client.get(
		url,
		OffsetResponseSchema,
		undefined,
		buildQueueHeaders(options?.orgId)
	);

	if (resp.success) {
		return resp.data.offset;
	}

	if (resp.message?.includes('not found')) {
		throw new QueueNotFoundError({
			queueName,
			message: resp.message,
		});
	}

	throw new QueueError({
		queueName,
		message: resp.message || 'Failed to get queue head',
	});
}

/**
 * Get the tail offset of a queue.
 *
 * Returns the offset of the newest (last) message in the queue.
 * The next published message will have offset = tail + 1.
 *
 * @param client - The API client instance
 * @param queueName - The name of the queue
 * @returns The tail offset (newest message position)
 * @throws {QueueValidationError} If validation fails
 * @throws {QueueNotFoundError} If the queue does not exist
 * @throws {QueueError} If the API request fails
 *
 * @example
 * ```typescript
 * const tail = await getQueueTail(client, 'events');
 * console.log(`Queue ends at offset ${tail}`);
 * ```
 */
export async function getQueueTail(
	client: APIClient,
	queueName: string,
	options?: QueueApiOptions
): Promise<number> {
	validateQueueName(queueName);
	const url = queueApiPath('tail', queueName);
	const resp = await client.get(
		url,
		OffsetResponseSchema,
		undefined,
		buildQueueHeaders(options?.orgId)
	);

	if (resp.success) {
		return resp.data.offset;
	}

	if (resp.message?.includes('not found')) {
		throw new QueueNotFoundError({
			queueName,
			message: resp.message,
		});
	}

	throw new QueueError({
		queueName,
		message: resp.message || 'Failed to get queue tail',
	});
}

/**
 * Receive the next available message from a queue.
 *
 * Atomically retrieves and locks the next pending message for processing.
 * The message state transitions to "processing" and must be acknowledged
 * (ack) or negative-acknowledged (nack) when done. Supports long polling
 * with an optional timeout.
 *
 * @param client - The API client instance
 * @param queueName - The name of the queue
 * @param timeout - Optional timeout in seconds for long polling (0-30)
 * @returns The received message, or null if no message is available
 * @throws {QueueValidationError} If validation fails
 * @throws {QueueNotFoundError} If the queue does not exist
 * @throws {QueueError} If the API request fails
 *
 * @example
 * ```typescript
 * // Receive with 10 second long poll
 * const message = await receiveMessage(client, 'tasks', 10);
 * if (message) {
 *   console.log(`Received: ${message.id}`);
 *   // Process message...
 *   await ackMessage(client, 'tasks', message.id);
 * }
 * ```
 */
export async function receiveMessage(
	client: APIClient,
	queueName: string,
	timeout?: number,
	options?: QueueApiOptions
): Promise<Message | null> {
	validateQueueName(queueName);

	const searchParams = new URLSearchParams();
	if (timeout !== undefined) {
		searchParams.set('timeout', String(timeout));
	}

	const queryString = searchParams.toString();
	const url = queueApiPathWithQuery('receive', queryString || undefined, queueName);
	const resp = await client.get(
		url,
		ReceiveResponseSchema,
		undefined,
		buildQueueHeaders(options?.orgId)
	);

	if (resp.success) {
		return resp.data.message;
	}

	if (resp.message?.includes('not found')) {
		throw new QueueNotFoundError({
			queueName,
			message: resp.message,
		});
	}

	throw new QueueError({
		queueName,
		message: resp.message || 'Failed to receive message',
	});
}

/**
 * Acknowledge successful processing of a message.
 *
 * Marks a message as successfully processed (completed state).
 * Should be called after successfully processing a message received
 * via receiveMessage. The message will not be redelivered.
 *
 * @param client - The API client instance
 * @param queueName - The name of the queue
 * @param messageId - The message ID to acknowledge (prefixed with msg_)
 * @returns void
 * @throws {QueueValidationError} If validation fails
 * @throws {MessageNotFoundError} If the message does not exist
 * @throws {QueueError} If the API request fails
 *
 * @example
 * ```typescript
 * const message = await receiveMessage(client, 'tasks');
 * if (message) {
 *   try {
 *     await processTask(message.payload);
 *     await ackMessage(client, 'tasks', message.id);
 *   } catch (error) {
 *     await nackMessage(client, 'tasks', message.id);
 *   }
 * }
 * ```
 */
export async function ackMessage(
	client: APIClient,
	queueName: string,
	messageId: string,
	options?: QueueApiOptions
): Promise<void> {
	validateQueueName(queueName);
	validateMessageId(messageId);

	const url = queueApiPath('ack', queueName, messageId);
	const resp = await client.post(
		url,
		undefined,
		AckNackResponseSchema,
		undefined,
		undefined,
		buildQueueHeaders(options?.orgId)
	);

	if (resp.success) {
		return;
	}

	if (resp.message?.includes('message') && resp.message?.includes('not found')) {
		throw new MessageNotFoundError({
			queueName,
			messageId,
			message: resp.message,
		});
	}

	throw new QueueError({
		queueName,
		message: resp.message || 'Failed to acknowledge message',
	});
}

/**
 * Negative acknowledge a message (mark as failed).
 *
 * Returns a message to the queue for retry. The message state returns
 * to pending and will be redelivered. Use when processing fails and
 * the message should be retried. After max retries, the message moves
 * to the dead letter queue.
 *
 * @param client - The API client instance
 * @param queueName - The name of the queue
 * @param messageId - The message ID to nack (prefixed with msg_)
 * @returns void
 * @throws {QueueValidationError} If validation fails
 * @throws {MessageNotFoundError} If the message does not exist
 * @throws {QueueError} If the API request fails
 *
 * @example
 * ```typescript
 * const message = await receiveMessage(client, 'tasks');
 * if (message) {
 *   try {
 *     await processTask(message.payload);
 *     await ackMessage(client, 'tasks', message.id);
 *   } catch (error) {
 *     // Processing failed, return to queue for retry
 *     await nackMessage(client, 'tasks', message.id);
 *   }
 * }
 * ```
 */
export async function nackMessage(
	client: APIClient,
	queueName: string,
	messageId: string,
	options?: QueueApiOptions
): Promise<void> {
	validateQueueName(queueName);
	validateMessageId(messageId);

	const url = queueApiPath('nack', queueName, messageId);
	const resp = await client.post(
		url,
		undefined,
		AckNackResponseSchema,
		undefined,
		undefined,
		buildQueueHeaders(options?.orgId)
	);

	if (resp.success) {
		return;
	}

	if (resp.message?.includes('message') && resp.message?.includes('not found')) {
		throw new MessageNotFoundError({
			queueName,
			messageId,
			message: resp.message,
		});
	}

	throw new QueueError({
		queueName,
		message: resp.message || 'Failed to negative acknowledge message',
	});
}
