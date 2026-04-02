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

import { FetchAdapter } from '../adapter.ts';
import { buildUrl, toServiceException, toPayload } from '../_util.ts';
import { StructuredError } from '../../error.ts';
import { z } from 'zod';

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
export const QueuePublishParamsSchema = z.object({
	/**
	 * Optional metadata to attach to the message.
	 * Can contain any JSON-serializable data for message routing or filtering.
	 */
	metadata: z
		.record(z.string(), z.unknown())
		.optional()
		.describe('Optional metadata to attach to the message.'),

	/**
	 * Optional partition key for message ordering.
	 * Messages with the same partition key are guaranteed to be processed in order.
	 */
	partitionKey: z.string().optional().describe('Optional partition key for message ordering.'),

	/**
	 * Optional idempotency key for deduplication.
	 * If a message with the same key was recently published, it will be deduplicated.
	 */
	idempotencyKey: z.string().optional().describe('Optional idempotency key for deduplication.'),

	/**
	 * Optional time-to-live in seconds.
	 * Messages will expire and be removed after this duration.
	 */
	ttl: z.number().optional().describe('Optional time-to-live in seconds.'),

	/**
	 * Optional project ID for cross-project publishing.
	 * If not specified, uses the current project context.
	 */
	projectId: z.string().optional().describe('Optional project ID for cross-project publishing.'),

	/**
	 * Optional agent ID for attribution.
	 * If not specified, uses the current agent context.
	 */
	agentId: z.string().optional().describe('Optional agent ID for attribution.'),

	/**
	 * Whether to publish synchronously.
	 * When true, the API waits for the message to be fully persisted before returning.
	 * When false (default), the API returns immediately with a pending message.
	 */
	sync: z.boolean().optional().describe('Whether to publish synchronously.'),
});

export type QueuePublishParams = z.infer<typeof QueuePublishParamsSchema>;

/**
 * Result of publishing a message to a queue.
 *
 * @example
 * ```typescript
 * const result = await queue.publish('my-queue', payload);
 * console.log(`Message ${result.id} published at offset ${result.offset}`);
 * ```
 */
export const QueuePublishResultSchema = z.object({
	/**
	 * The unique message ID (prefixed with msg_).
	 * Use this ID to track, acknowledge, or delete the message.
	 */
	id: z.string().describe('The unique message ID (prefixed with msg_).'),

	/**
	 * The sequential offset of the message in the queue.
	 * Offsets are monotonically increasing and can be used for log-style consumption.
	 */
	offset: z.number().describe('The sequential offset of the message in the queue.'),

	/**
	 * ISO 8601 timestamp when the message was published.
	 */
	publishedAt: z.string().describe('ISO 8601 timestamp when the message was published.'),
});

export type QueuePublishResult = z.infer<typeof QueuePublishResultSchema>;

/**
 * Parameters for creating a queue.
 *
 * @example
 * ```typescript
 * const result = await ctx.queue.createQueue('my-queue', {
 *   queueType: 'pubsub',
 *   settings: { defaultTtlSeconds: 86400 },
 * });
 * ```
 */
export const QueueCreateParamsSchema = z.object({
	/**
	 * Type of queue to create.
	 * - `worker`: Messages are consumed by exactly one consumer with acknowledgment.
	 * - `pubsub`: Messages are broadcast to all subscribers.
	 * @default 'worker'
	 */
	queueType: z.enum(['worker', 'pubsub']).optional().describe('Type of queue to create.'),

	/**
	 * Optional description of the queue's purpose.
	 */
	description: z.string().optional().describe("Optional description of the queue's purpose."),

	/**
	 * Optional settings to customize queue behavior.
	 * Only provided fields are applied; others use server defaults.
	 */
	settings: z
		.object({
			/** Default time-to-live for messages in seconds. Null means no expiration. */
			defaultTtlSeconds: z
				.number()
				.nullable()
				.optional()
				.describe('Default time-to-live for messages in seconds. Null means no expiration.'),
			/** Time in seconds a message is invisible after being received. */
			defaultVisibilityTimeoutSeconds: z
				.number()
				.optional()
				.describe('Time in seconds a message is invisible after being received.'),
			/** Maximum number of delivery attempts before moving to DLQ. */
			defaultMaxRetries: z
				.number()
				.optional()
				.describe('Maximum number of delivery attempts before moving to DLQ.'),
			/** Maximum number of messages a single client can process concurrently. */
			maxInFlightPerClient: z
				.number()
				.optional()
				.describe('Maximum number of messages a single client can process concurrently.'),
			/** Retention period for acknowledged messages in seconds. */
			retentionSeconds: z
				.number()
				.optional()
				.describe('Retention period for acknowledged messages in seconds.'),
		})
		.optional()
		.describe('Optional settings to customize queue behavior.'),
});

export type QueueCreateParams = z.infer<typeof QueueCreateParamsSchema>;

/**
 * Result of creating a queue.
 */
export const QueueCreateResultSchema = z.object({
	/** The queue name. */
	name: z.string().describe('The queue name.'),
	/** The queue type ('worker' or 'pubsub'). */
	queueType: z.string().describe("The queue type ('worker' or 'pubsub')."),
});

export type QueueCreateResult = z.infer<typeof QueueCreateResultSchema>;

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

	/**
	 * Create a queue with idempotent semantics.
	 *
	 * If the queue already exists, this returns successfully without error.
	 * Safe to call multiple times — uses an internal cache to avoid redundant API calls.
	 *
	 * @param queueName - The name of the queue to create
	 * @param params - Optional creation parameters (queue type, settings, etc.)
	 * @returns The create result with queue name and type
	 * @throws {QueueValidationError} If the queue name is invalid
	 *
	 * @example Creating a worker queue
	 * ```typescript
	 * const result = await ctx.queue.createQueue('task-queue');
	 * ```
	 *
	 * @example Creating a pubsub queue with settings
	 * ```typescript
	 * const result = await ctx.queue.createQueue('events', {
	 *   queueType: 'pubsub',
	 *   settings: { defaultTtlSeconds: 86400 },
	 * });
	 * ```
	 */
	createQueue(queueName: string, params?: QueueCreateParams): Promise<QueueCreateResult>;

	/**
	 * Delete a queue.
	 *
	 * Permanently deletes a queue and all its messages. This action cannot be undone.
	 * If the queue has already been deleted or does not exist, a {@link QueueNotFoundError} is thrown.
	 *
	 * @param queueName - The name of the queue to delete
	 * @throws {QueueNotFoundError} If the queue does not exist
	 * @throws {QueueValidationError} If the queue name is invalid
	 *
	 * @example Deleting a queue
	 * ```typescript
	 * await ctx.queue.deleteQueue('old-queue');
	 * ```
	 */
	deleteQueue(queueName: string): Promise<void>;
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

/**
 * Unwraps the standard API response envelope.
 *
 * The queue server returns responses wrapped in:
 *   { success: true, data: { [key]: { ...actual data... } } }
 *
 * Since `fromResponse()` parses the raw JSON body, `res.data` from the
 * adapter is the full envelope. This helper extracts the nested data by key.
 *
 * Falls back to treating the input as already-unwrapped data (e.g., in tests
 * using mock adapters that provide flat data directly).
 *
 * @internal
 */
function unwrapApiResponse<T>(data: unknown, key: string): T {
	if (data !== null && typeof data === 'object') {
		const body = data as Record<string, unknown>;
		if (body.success === true && typeof body.data === 'object' && body.data !== null) {
			const envelope = body.data as Record<string, unknown>;
			if (key in envelope) {
				return envelope[key] as T;
			}
		}
	}
	return data as T;
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
	#knownQueues = new Set<string>();

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

		const basePath = `/queue/messages/publish/${encodeURIComponent(queueName)}`;
		const url = buildUrl(this.#baseUrl, params?.sync ? `${basePath}?sync=true` : basePath);

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
			const data = unwrapApiResponse<Record<string, unknown>>(res.data, 'message');
			const result = QueuePublishResultSchema.safeParse({
				id: data.id,
				offset: data.offset,
				publishedAt: data.published_at,
			});
			if (result.success) {
				return result.data;
			}
			throw new QueuePublishError({
				message: `Queue publish returned an unexpected response format: ${result.error.message}`,
			});
		}

		if (res.response.status === 404) {
			throw new QueueNotFoundError({
				message: `Queue not found: ${queueName}`,
			});
		}

		throw await toServiceException('POST', url, res.response);
	}

	/**
	 * @inheritdoc
	 */
	async createQueue(queueName: string, params?: QueueCreateParams): Promise<QueueCreateResult> {
		validateQueueNameInternal(queueName);

		if (this.#knownQueues.has(queueName)) {
			return {
				name: queueName,
				queueType: params?.queueType ?? 'worker',
			};
		}

		const url = buildUrl(this.#baseUrl, '/queue/create');

		const requestBody: Record<string, unknown> = {
			name: queueName,
			queue_type: params?.queueType ?? 'worker',
		};

		if (params?.description !== undefined) {
			requestBody.description = params.description;
		}

		if (params?.settings) {
			const settings: Record<string, unknown> = {};
			if (params.settings.defaultTtlSeconds !== undefined) {
				settings.default_ttl_seconds = params.settings.defaultTtlSeconds;
			}
			if (params.settings.defaultVisibilityTimeoutSeconds !== undefined) {
				settings.default_visibility_timeout_seconds =
					params.settings.defaultVisibilityTimeoutSeconds;
			}
			if (params.settings.defaultMaxRetries !== undefined) {
				settings.default_max_retries = params.settings.defaultMaxRetries;
			}
			if (params.settings.maxInFlightPerClient !== undefined) {
				settings.max_in_flight_per_client = params.settings.maxInFlightPerClient;
			}
			if (params.settings.retentionSeconds !== undefined) {
				settings.retention_seconds = params.settings.retentionSeconds;
			}
			if (Object.keys(settings).length > 0) {
				requestBody.settings = settings;
			}
		}

		const signal = AbortSignal.timeout(30_000);
		const res = await this.#adapter.invoke<QueueCreateResult>(url, {
			method: 'POST',
			signal,
			body: JSON.stringify(requestBody),
			contentType: 'application/json',
			telemetry: {
				name: 'agentuity.queue.create',
				attributes: {
					queueName,
				},
			},
		});

		if (res.ok) {
			const data = unwrapApiResponse<Record<string, unknown>>(res.data, 'queue');
			this.#knownQueues.add(queueName);
			return {
				name: (data.name as string) ?? queueName,
				queueType: (data.queue_type as string) ?? params?.queueType ?? 'worker',
			};
		}

		if (res.response.status === 409) {
			this.#knownQueues.add(queueName);
			return {
				name: queueName,
				queueType: params?.queueType ?? 'worker',
			};
		}

		throw await toServiceException('POST', url, res.response);
	}

	/**
	 * @inheritdoc
	 */
	async deleteQueue(queueName: string): Promise<void> {
		validateQueueNameInternal(queueName);

		const url = buildUrl(this.#baseUrl, `/queue/delete/${encodeURIComponent(queueName)}`);

		const signal = AbortSignal.timeout(30_000);
		const res = await this.#adapter.invoke<void>(url, {
			method: 'DELETE',
			signal,
			telemetry: {
				name: 'agentuity.queue.delete',
				attributes: {
					queueName,
				},
			},
		});

		if (res.ok) {
			this.#knownQueues.delete(queueName);
			return;
		}

		if (res.response.status === 404) {
			throw new QueueNotFoundError({
				message: `Queue not found: ${queueName}`,
			});
		}

		throw await toServiceException('DELETE', url, res.response);
	}
}
