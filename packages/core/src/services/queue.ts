/**
 * @module queue
 *
 * Queue service for publishing messages to Agentuity queues.
 *
 * This module provides a simplified interface for agents to publish messages
 * to queues. For full queue management (CRUD, consume, acknowledge), use
 * the `@agentuity/server` package.
 *
 * @example Publishing from an agent
 * ```typescript
 * // Inside an agent handler
 * const result = await ctx.queue.publish('order-queue', {
 *   orderId: 123,
 *   action: 'process',
 * });
 * console.log(`Published message ${result.id}`);
 * ```
 */

import { FetchAdapter } from './adapter';
import { buildUrl, toServiceException, toPayload } from './_util';
import { StructuredError } from '../error';

/**
 * Parameters for publishing a message to a queue.
 *
 * @example
 * ```typescript
 * const params: QueuePublishParams = {
 *   metadata: { priority: 'high' },
 *   partitionKey: 'customer-123',
 *   idempotencyKey: 'order-456-v1',
 *   ttl: 3600, // 1 hour
 * };
 * ```
 */
export interface QueuePublishParams {
	/**
	 * Optional metadata to attach to the message.
	 * Can contain any JSON-serializable data for message routing or filtering.
	 */
	metadata?: Record<string, unknown>;

	/**
	 * Optional partition key for message ordering.
	 * Messages with the same partition key are guaranteed to be processed in order.
	 */
	partitionKey?: string;

	/**
	 * Optional idempotency key for deduplication.
	 * If a message with the same key was recently published, it will be deduplicated.
	 */
	idempotencyKey?: string;

	/**
	 * Optional time-to-live in seconds.
	 * Messages will expire and be removed after this duration.
	 */
	ttl?: number;

	/**
	 * Optional project ID for cross-project publishing.
	 * If not specified, uses the current project context.
	 */
	projectId?: string;

	/**
	 * Optional agent ID for attribution.
	 * If not specified, uses the current agent context.
	 */
	agentId?: string;
}

/**
 * Result of publishing a message to a queue.
 *
 * @example
 * ```typescript
 * const result = await queue.publish('my-queue', payload);
 * console.log(`Message ${result.id} published at offset ${result.offset}`);
 * ```
 */
export interface QueuePublishResult {
	/**
	 * The unique message ID (prefixed with msg_).
	 * Use this ID to track, acknowledge, or delete the message.
	 */
	id: string;

	/**
	 * The sequential offset of the message in the queue.
	 * Offsets are monotonically increasing and can be used for log-style consumption.
	 */
	offset: number;

	/**
	 * ISO 8601 timestamp when the message was published.
	 */
	publishedAt: string;
}

/**
 * Queue service interface for publishing messages.
 *
 * This is the interface available to agents via `ctx.queue`. It provides
 * a simple publish-only interface suitable for agent workflows.
 *
 * For full queue management (create queues, consume messages, manage destinations),
 * use the `@agentuity/server` package.
 *
 * @example
 * ```typescript
 * // In an agent handler
 * export default createAgent('my-agent', {
 *   handler: async (ctx, input) => {
 *     // Publish a message to a queue
 *     await ctx.queue.publish('notifications', {
 *       type: 'email',
 *       to: input.email,
 *       subject: 'Welcome!',
 *     });
 *     return { success: true };
 *   },
 * });
 * ```
 */
export interface QueueService {
	/**
	 * Publish a message to a queue.
	 *
	 * The payload can be a string or an object. Objects are automatically
	 * JSON-stringified before publishing.
	 *
	 * @param queueName - The name of the queue to publish to
	 * @param payload - The message payload (string or JSON-serializable object)
	 * @param params - Optional publish parameters (metadata, TTL, etc.)
	 * @returns The publish result with message ID and offset
	 * @throws {QueueNotFoundError} If the queue does not exist
	 * @throws {QueueValidationError} If validation fails (invalid name, payload too large, etc.)
	 * @throws {QueuePublishError} If the publish operation fails
	 *
	 * @example Publishing a simple message
	 * ```typescript
	 * const result = await ctx.queue.publish('my-queue', 'Hello, World!');
	 * ```
	 *
	 * @example Publishing with options
	 * ```typescript
	 * const result = await ctx.queue.publish('my-queue', { task: 'process' }, {
	 *   metadata: { priority: 'high' },
	 *   idempotencyKey: 'task-123',
	 *   ttl: 3600,
	 * });
	 * ```
	 */
	publish(
		queueName: string,
		payload: string | object,
		params?: QueuePublishParams
	): Promise<QueuePublishResult>;
}

// ============================================================================
// Errors
// ============================================================================

/**
 * Error thrown when a publish operation fails.
 *
 * This is a general error for publish failures that aren't specifically
 * validation or not-found errors.
 */
export const QueuePublishError = StructuredError('QueuePublishError');

/**
 * Error thrown when a queue is not found.
 *
 * @example
 * ```typescript
 * try {
 *   await ctx.queue.publish('non-existent', 'payload');
 * } catch (error) {
 *   if (error instanceof QueueNotFoundError) {
 *     console.error('Queue does not exist');
 *   }
 * }
 * ```
 */
export const QueueNotFoundError = StructuredError('QueueNotFoundError');

/**
 * Error thrown when validation fails.
 *
 * Contains the field name and optionally the invalid value for debugging.
 */
export const QueueValidationError = StructuredError('QueueValidationError')<{
	/** The field that failed validation */
	field: string;
	/** The invalid value (for debugging) */
	value?: unknown;
}>();

// ============================================================================
// Internal Validation
// ============================================================================

const MAX_QUEUE_NAME_LENGTH = 256;
const MAX_PAYLOAD_SIZE = 1048576;
const MAX_PARTITION_KEY_LENGTH = 256;
const MAX_IDEMPOTENCY_KEY_LENGTH = 256;
const VALID_QUEUE_NAME_REGEX = /^[a-z_][a-z0-9_-]*$/;

/** @internal */
function validateQueueNameInternal(name: string): void {
	if (!name || name.length === 0) {
		throw new QueueValidationError({
			message: 'Queue name cannot be empty',
			field: 'queueName',
			value: name,
		});
	}
	if (name.length > MAX_QUEUE_NAME_LENGTH) {
		throw new QueueValidationError({
			message: `Queue name must not exceed ${MAX_QUEUE_NAME_LENGTH} characters`,
			field: 'queueName',
			value: name,
		});
	}
	if (!VALID_QUEUE_NAME_REGEX.test(name)) {
		throw new QueueValidationError({
			message:
				'Queue name must start with a letter or underscore and contain only lowercase letters, digits, underscores, and hyphens',
			field: 'queueName',
			value: name,
		});
	}
}

/** @internal */
function validatePayloadInternal(payload: string): void {
	if (!payload || payload.length === 0) {
		throw new QueueValidationError({
			message: 'Payload cannot be empty',
			field: 'payload',
		});
	}
	if (payload.length > MAX_PAYLOAD_SIZE) {
		throw new QueueValidationError({
			message: `Payload size exceeds ${MAX_PAYLOAD_SIZE} byte limit (${payload.length} bytes)`,
			field: 'payload',
			value: payload.length,
		});
	}
}

// ============================================================================
// QueueStorageService Implementation
// ============================================================================

/**
 * HTTP-based implementation of the QueueService interface.
 *
 * This service communicates with the Agentuity Queue API to publish messages.
 * It is automatically configured and available via `ctx.queue` in agent handlers.
 *
 * @internal This class is instantiated by the runtime; use `ctx.queue` instead.
 */
export class QueueStorageService implements QueueService {
	#adapter: FetchAdapter;
	#baseUrl: string;

	/**
	 * Creates a new QueueStorageService.
	 *
	 * @param baseUrl - The base URL of the Queue API
	 * @param adapter - The fetch adapter for making HTTP requests
	 */
	constructor(baseUrl: string, adapter: FetchAdapter) {
		this.#adapter = adapter;
		this.#baseUrl = baseUrl;
	}

	/**
	 * @inheritdoc
	 */
	async publish(
		queueName: string,
		payload: string | object,
		params?: QueuePublishParams
	): Promise<QueuePublishResult> {
		// Validate inputs before sending to API
		validateQueueNameInternal(queueName);

		const [body] = await toPayload(payload);
		const payloadStr = typeof payload === 'string' ? payload : (body as string);
		validatePayloadInternal(payloadStr);

		// Validate optional params
		if (params?.partitionKey && params.partitionKey.length > MAX_PARTITION_KEY_LENGTH) {
			throw new QueueValidationError({
				message: `Partition key must not exceed ${MAX_PARTITION_KEY_LENGTH} characters`,
				field: 'partitionKey',
				value: params.partitionKey.length,
			});
		}
		if (params?.idempotencyKey && params.idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
			throw new QueueValidationError({
				message: `Idempotency key must not exceed ${MAX_IDEMPOTENCY_KEY_LENGTH} characters`,
				field: 'idempotencyKey',
				value: params.idempotencyKey.length,
			});
		}
		if (params?.ttl !== undefined && params.ttl < 0) {
			throw new QueueValidationError({
				message: 'TTL cannot be negative',
				field: 'ttl',
				value: params.ttl,
			});
		}

		const url = buildUrl(
			this.#baseUrl,
			`/queue/messages/publish/2026-01-15/${encodeURIComponent(queueName)}`
		);

		const requestBody: Record<string, unknown> = {
			payload: typeof payload === 'string' ? payload : body,
		};

		if (params?.metadata) {
			requestBody.metadata = params.metadata;
		}
		if (params?.partitionKey) {
			requestBody.partition_key = params.partitionKey;
		}
		if (params?.idempotencyKey) {
			requestBody.idempotency_key = params.idempotencyKey;
		}
		if (params?.ttl !== undefined) {
			requestBody.ttl_seconds = params.ttl;
		}
		if (params?.projectId) {
			requestBody.project_id = params.projectId;
		}
		if (params?.agentId) {
			requestBody.agent_id = params.agentId;
		}

		const signal = AbortSignal.timeout(30_000);
		const res = await this.#adapter.invoke<QueuePublishResult>(url, {
			method: 'POST',
			signal,
			body: JSON.stringify(requestBody),
			contentType: 'application/json',
			telemetry: {
				name: 'agentuity.queue.publish',
				attributes: {
					queueName,
				},
			},
		});

		if (res.ok) {
			const data = res.data as unknown as {
				message: { id: string; offset: number; published_at: string };
			};
			return {
				id: data.message.id,
				offset: data.message.offset,
				publishedAt: data.message.published_at,
			};
		}

		if (res.response.status === 404) {
			throw new QueueNotFoundError({
				message: `Queue not found: ${queueName}`,
			});
		}

		throw await toServiceException('POST', url, res.response);
	}
}
