import { z } from 'zod';

/**
 * Queue type schema for validation.
 *
 * - `worker`: Messages are consumed by workers with acknowledgment. Each message is processed by exactly one consumer.
 * - `pubsub`: Messages are broadcast to all subscribers. Multiple consumers can receive the same message.
 *
 * @example
 * ```typescript
 * const queueType = QueueTypeSchema.parse('worker'); // 'worker' | 'pubsub'
 * ```
 */
export const QueueTypeSchema = z.enum(['worker', 'pubsub']).describe('Queue type schema');

/**
 * Queue type - either 'worker' for task queues or 'pubsub' for broadcast messaging.
 */
export type QueueType = z.infer<typeof QueueTypeSchema>;

export type QueueSortField = 'name' | 'created' | 'updated' | 'message_count' | 'dlq_count';

/**
 * Base queue settings schema without defaults - used for partial updates.
 *
 * This schema is used for PATCH operations where we don't want Zod to apply
 * default values for missing fields (which would overwrite existing values).
 */
const QueueSettingsSchemaBase = z.object({
	default_ttl_seconds: z
		.number()
		.nullable()
		.optional()
		.describe('Default time-to-live for messages in seconds. Null means no expiration.'),
	default_visibility_timeout_seconds: z
		.number()
		.optional()
		.describe('Time in seconds a message is invisible after being received.'),
	default_max_retries: z
		.number()
		.optional()
		.describe('Maximum number of delivery attempts before moving to DLQ.'),
	default_retry_backoff_ms: z
		.number()
		.optional()
		.describe('Initial backoff delay in milliseconds for retries.'),
	default_retry_max_backoff_ms: z
		.number()
		.optional()
		.describe('Maximum backoff delay in milliseconds for retries.'),
	default_retry_multiplier: z.number().optional().describe('Multiplier for exponential backoff.'),
	max_in_flight_per_client: z
		.number()
		.optional()
		.describe('Maximum number of messages a single client can process concurrently.'),
	retention_seconds: z
		.number()
		.optional()
		.describe('Retention period for acknowledged messages in seconds.'),
});

/**
 * Queue settings schema for configuring queue behavior.
 *
 * These settings control message lifecycle, retry behavior, and concurrency limits.
 * This schema includes defaults and is used for output types and documentation.
 *
 * @example
 * ```typescript
 * const settings = QueueSettingsSchema.parse({
 *   default_ttl_seconds: 3600,           // Messages expire after 1 hour
 *   default_visibility_timeout_seconds: 60, // Processing timeout
 *   default_max_retries: 3,              // Retry failed messages 3 times
 * });
 * ```
 */
export const QueueSettingsSchema = z
	.object({
		default_ttl_seconds: z
			.number()
			.nullable()
			.optional()
			.describe('Default time-to-live for messages in seconds. Null means no expiration.'),
		default_visibility_timeout_seconds: z
			.number()
			.default(30)
			.describe('Time in seconds a message is invisible after being received (default: 30).'),
		default_max_retries: z
			.number()
			.default(5)
			.describe('Maximum number of delivery attempts before moving to DLQ (default: 5).'),
		default_retry_backoff_ms: z
			.number()
			.default(1000)
			.describe('Initial backoff delay in milliseconds for retries (default: 1000).'),
		default_retry_max_backoff_ms: z
			.number()
			.default(60000)
			.describe('Maximum backoff delay in milliseconds for retries (default: 60000).'),
		default_retry_multiplier: z
			.number()
			.default(2.0)
			.describe('Multiplier for exponential backoff (default: 2.0).'),
		max_in_flight_per_client: z
			.number()
			.default(10)
			.describe(
				'Maximum number of messages a single client can process concurrently (default: 10).'
			),
		retention_seconds: z
			.number()
			.default(2592000)
			.describe('Retention period for acknowledged messages in seconds (default: 30 days).'),
	})
	.describe('Queue settings schema');

/**
 * Queue settings configuration type.
 */
export type QueueSettings = z.infer<typeof QueueSettingsSchema>;

/**
 * Queue statistics schema showing current queue state.
 */
export const QueueStatsSchema = z
	.object({
		message_count: z.number().describe('Total number of messages currently in the queue.'),
		dlq_count: z.number().describe('Number of messages in the dead letter queue.'),
		next_offset: z.number().describe('The next offset that will be assigned to a new message.'),
	})
	.describe('Queue stats schema');

/**
 * Queue statistics type.
 */
export type QueueStats = z.infer<typeof QueueStatsSchema>;

/**
 * Queue schema representing a message queue.
 *
 * @example
 * ```typescript
 * const queue = await getQueue(client, 'my-queue');
 * console.log(`Queue ${queue.name} has ${queue.message_count} messages`);
 * ```
 */
export const QueueSchema = z
	.object({
		id: z.string().describe('Unique identifier for the queue.'),
		name: z.string().describe('Human-readable queue name (used for API operations).'),
		description: z
			.string()
			.nullable()
			.optional()
			.describe("Optional description of the queue's purpose."),
		internal: z.boolean().optional().describe('Whether the queue is system-managed.'),
		queue_type: QueueTypeSchema.describe('The type of queue (worker or pubsub).'),
		default_ttl_seconds: z
			.number()
			.nullable()
			.optional()
			.describe('Default time-to-live for messages in seconds. Null means no expiration.'),
		default_visibility_timeout_seconds: z
			.number()
			.optional()
			.describe('Time in seconds a message is invisible after being received.'),
		default_max_retries: z
			.number()
			.optional()
			.describe('Maximum number of delivery attempts before moving to DLQ.'),
		default_retry_backoff_ms: z
			.number()
			.optional()
			.describe('Initial backoff delay in milliseconds for retries.'),
		default_retry_max_backoff_ms: z
			.number()
			.optional()
			.describe('Maximum backoff delay in milliseconds for retries.'),
		default_retry_multiplier: z
			.number()
			.optional()
			.describe('Multiplier for exponential backoff.'),
		max_in_flight_per_client: z
			.number()
			.optional()
			.describe('Maximum number of messages a single client can process concurrently.'),
		next_offset: z
			.number()
			.optional()
			.describe('The next offset that will be assigned to a new message.'),
		message_count: z
			.number()
			.optional()
			.describe('Total number of messages currently in the queue.'),
		dlq_count: z.number().optional().describe('Number of messages in the dead letter queue.'),
		created_at: z.string().describe('ISO 8601 timestamp when the queue was created.'),
		updated_at: z.string().describe('ISO 8601 timestamp when the queue was last updated.'),
		paused_at: z
			.string()
			.nullable()
			.optional()
			.describe('ISO 8601 timestamp when the queue was paused (null if not paused).'),
		retention_seconds: z
			.number()
			.optional()
			.describe('Retention period for acknowledged messages in seconds.'),
	})
	.describe('Queue schema');

/**
 * Queue type representing a message queue instance.
 */
export type Queue = z.infer<typeof QueueSchema>;

/**
 * Message state schema for tracking message lifecycle.
 *
 * - `pending`: Message is waiting to be processed.
 * - `leased`: Message has been received and is currently being processed by a consumer.
 * - `processing`: Message has been received and is being processed (legacy, equivalent to leased).
 * - `delivered`: Message was successfully acknowledged.
 * - `failed`: Message processing failed but may be retried.
 * - `dead`: Message exceeded retry limit and was moved to DLQ.
 */
export const MessageStateSchema = z
	.enum(['pending', 'leased', 'processing', 'delivered', 'failed', 'dead'])
	.describe('Message state schema');

/**
 * Message state type.
 */
export type MessageState = z.infer<typeof MessageStateSchema>;

/**
 * Message schema representing a queue message.
 *
 * @example
 * ```typescript
 * const message = await publishMessage(client, 'my-queue', { payload: 'Hello' });
 * console.log(`Published message ${message.id} at offset ${message.offset}`);
 * ```
 */
export const MessageSchema = z
	.object({
		id: z.string().describe('Unique identifier for the message (prefixed with qmsg_).'),
		queue_id: z.string().describe('ID of the queue this message belongs to.'),
		offset: z.number().describe('Sequential offset within the queue.'),
		payload: z.unknown().describe('The message payload (JSON object).'),
		size: z.number().optional().describe('Size of the message payload in bytes.'),
		metadata: z
			.record(z.string(), z.unknown())
			.nullable()
			.optional()
			.describe('Optional metadata attached to the message.'),
		state: MessageStateSchema.optional().describe('Current state of the message.'),
		idempotency_key: z
			.string()
			.nullable()
			.optional()
			.describe('Optional key for message deduplication.'),
		partition_key: z
			.string()
			.nullable()
			.optional()
			.describe('Optional key for message ordering.'),
		ttl_seconds: z
			.number()
			.nullable()
			.optional()
			.describe('Time-to-live in seconds (null means no expiration).'),
		delivery_attempts: z
			.number()
			.optional()
			.describe('Number of times delivery has been attempted.'),
		max_retries: z.number().optional().describe('Maximum number of delivery attempts allowed.'),
		published_at: z
			.string()
			.optional()
			.describe('ISO 8601 timestamp when the message was published.'),
		expires_at: z
			.string()
			.nullable()
			.optional()
			.describe('ISO 8601 timestamp when the message will expire (if TTL set).'),
		delivered_at: z
			.string()
			.nullable()
			.optional()
			.describe('ISO 8601 timestamp when the message was delivered.'),
		acknowledged_at: z
			.string()
			.nullable()
			.optional()
			.describe('ISO 8601 timestamp when the message was acknowledged.'),
		created_at: z
			.string()
			.optional()
			.describe('ISO 8601 timestamp when the message was created.'),
		updated_at: z
			.string()
			.optional()
			.describe('ISO 8601 timestamp when the message was last updated.'),
		source_id: z
			.string()
			.nullable()
			.optional()
			.describe('ID of the source that ingested this message (null if published directly).'),
		source_name: z
			.string()
			.nullable()
			.optional()
			.describe('Name of the source that ingested this message.'),
	})
	.describe('Message schema');

/**
 * Message type representing a queue message.
 */
export type Message = z.infer<typeof MessageSchema>;

/**
 * Destination type schema. Currently only HTTP webhooks are supported.
 */
export const DestinationTypeSchema = z.enum(['http']).describe('Destination type schema');

/**
 * Destination type.
 */
export type DestinationType = z.infer<typeof DestinationTypeSchema>;

/**
 * HTTP destination configuration schema for webhook delivery.
 *
 * @example
 * ```typescript
 * const config: HttpDestinationConfig = {
 *   url: 'https://api.example.com/webhook',
 *   method: 'POST',
 *   headers: { 'X-Custom-Header': 'value' },
 *   timeout_ms: 10000,
 *   retry_policy: { max_attempts: 3 },
 * };
 * ```
 */
export const HttpDestinationConfigSchema = z
	.object({
		url: z.string().describe('The URL to send messages to.'),
		headers: z
			.record(z.string(), z.string())
			.optional()
			.describe('Optional custom headers to include in requests.'),
		method: z.string().default('POST').describe('HTTP method to use (default: POST).'),
		timeout_ms: z
			.number()
			.default(30000)
			.describe('Request timeout in milliseconds (default: 30000).'),
		retry_policy: z
			.object({
				max_attempts: z
					.number()
					.default(5)
					.describe('Maximum number of delivery attempts (default: 5).'),
				initial_backoff_ms: z
					.number()
					.default(1000)
					.describe('Initial backoff delay in milliseconds (default: 1000).'),
				max_backoff_ms: z
					.number()
					.default(60000)
					.describe('Maximum backoff delay in milliseconds (default: 60000).'),
				backoff_multiplier: z
					.number()
					.default(2.0)
					.describe('Backoff multiplier for exponential backoff (default: 2.0).'),
			})
			.optional()
			.describe('Optional retry policy for failed deliveries.'),
		signing: z
			.object({
				enabled: z
					.boolean()
					.default(false)
					.describe('Whether signing is enabled (default: false).'),
				secret_key: z.string().optional().describe('Secret key for HMAC signing.'),
			})
			.optional()
			.describe('Optional request signing configuration.'),
	})
	.describe('Http destination config schema');

/**
 * HTTP destination configuration type.
 */
export type HttpDestinationConfig = z.infer<typeof HttpDestinationConfigSchema>;

/**
 * Destination statistics schema showing delivery metrics.
 */
export const DestinationStatsSchema = z
	.object({
		total_deliveries: z.number().describe('Total number of delivery attempts.'),
		successful_deliveries: z.number().describe('Number of successful deliveries.'),
		failed_deliveries: z.number().describe('Number of failed deliveries.'),
		last_delivery_at: z
			.string()
			.nullable()
			.optional()
			.describe('ISO 8601 timestamp of the last delivery attempt.'),
		last_success_at: z
			.string()
			.nullable()
			.optional()
			.describe('ISO 8601 timestamp of the last successful delivery.'),
		last_failure_at: z
			.string()
			.nullable()
			.optional()
			.describe('ISO 8601 timestamp of the last failed delivery.'),
	})
	.describe('Destination stats schema');

/**
 * Destination statistics type.
 */
export type DestinationStats = z.infer<typeof DestinationStatsSchema>;

/**
 * Destination schema representing a webhook endpoint for message delivery.
 *
 * Destinations are attached to queues and automatically receive messages when published.
 *
 * @example
 * ```typescript
 * const destination = await createDestination(client, 'my-queue', {
 *   destination_type: 'http',
 *   config: { url: 'https://api.example.com/webhook' },
 *   enabled: true,
 * });
 * ```
 */
export const DestinationSchema = z
	.object({
		id: z.string().describe('Unique identifier for the destination (prefixed with dest_).'),
		name: z.string().describe('Human-readable name for the destination.'),
		description: z
			.string()
			.nullable()
			.optional()
			.describe('Optional description of the destination.'),
		queue_id: z.string().describe('ID of the queue this destination is attached to.'),
		destination_type: DestinationTypeSchema.describe(
			"Type of destination (currently only 'http')."
		),
		config: HttpDestinationConfigSchema.describe('HTTP configuration for the destination.'),
		enabled: z.boolean().describe('Whether the destination is enabled for delivery.'),
		stats: DestinationStatsSchema.optional().describe(
			'Delivery statistics for this destination.'
		),
		success_count: z.number().optional().describe('Total successful deliveries.'),
		failure_count: z.number().optional().describe('Total failed deliveries.'),
		last_success_at: z
			.string()
			.nullable()
			.optional()
			.describe('ISO 8601 timestamp of last success.'),
		last_failure_at: z
			.string()
			.nullable()
			.optional()
			.describe('ISO 8601 timestamp of last failure.'),
		last_failure_error: z
			.string()
			.nullable()
			.optional()
			.describe('Error message from last failure.'),
		created_at: z.string().describe('ISO 8601 timestamp when the destination was created.'),
		updated_at: z.string().describe('ISO 8601 timestamp when the destination was last updated.'),
	})
	.describe('Destination schema');

/**
 * Destination type representing a webhook endpoint.
 */
export type Destination = z.infer<typeof DestinationSchema>;

/**
 * Dead letter message schema for messages that failed processing.
 *
 * Messages are moved to the dead letter queue (DLQ) after exceeding the maximum
 * retry limit. They can be inspected, replayed, or deleted.
 *
 * @example
 * ```typescript
 * const { messages } = await listDeadLetterMessages(client, 'my-queue');
 * for (const msg of messages) {
 *   console.log(`Failed message: ${msg.failure_reason}`);
 *   await replayDeadLetterMessage(client, 'my-queue', msg.id);
 * }
 * ```
 */
export const DeadLetterMessageSchema = z
	.object({
		id: z.string().describe('Unique identifier for the DLQ entry.'),
		queue_id: z.string().describe('ID of the queue this message belongs to.'),
		original_message_id: z
			.string()
			.optional()
			.describe('ID of the original message that failed (optional until backend includes it).'),
		offset: z.number().describe('Offset of the original message in the queue.'),
		payload: z.unknown().describe('The message payload (JSON object).'),
		metadata: z
			.record(z.string(), z.unknown())
			.nullable()
			.optional()
			.describe('Optional metadata from the original message.'),
		failure_reason: z
			.string()
			.nullable()
			.optional()
			.describe('Reason why the message was moved to DLQ.'),
		delivery_attempts: z.number().describe('Number of delivery attempts before failure.'),
		moved_at: z
			.string()
			.optional()
			.describe(
				'ISO 8601 timestamp when the message was moved to DLQ (optional until backend includes it).'
			),
		original_published_at: z
			.string()
			.optional()
			.describe(
				'ISO 8601 timestamp when the original message was published (optional, falls back to published_at).'
			),
		published_at: z
			.string()
			.optional()
			.describe('ISO 8601 timestamp when the message was published (from base message).'),
		created_at: z.string().describe('ISO 8601 timestamp when the DLQ entry was created.'),
	})
	.describe('Dead letter message schema');

/**
 * Dead letter message type.
 */
export type DeadLetterMessage = z.infer<typeof DeadLetterMessageSchema>;

// ============================================================================
// API Options
// ============================================================================

/**
 * Common options for queue API calls.
 *
 * Used to pass organization context when calling from CLI or other
 * contexts where the org is not implicit in the authentication token.
 */
export const QueueApiOptionsSchema = z
	.object({
		orgId: z
			.string()
			.optional()
			.describe('Organization ID for CLI-authenticated requests without embedded org context'),
		sync: z
			.boolean()
			.optional()
			.describe('Whether message publishing waits for persistence before returning'),
	})
	.describe('Queue api options schema');

export type QueueApiOptions = z.infer<typeof QueueApiOptionsSchema>;

// ============================================================================
// Request Schemas
// ============================================================================

/**
 * Request schema for creating a new queue.
 *
 * @example
 * ```typescript
 * const request: CreateQueueRequest = {
 *   name: 'my-worker-queue',
 *   queue_type: 'worker',
 *   description: 'Processes background jobs',
 *   settings: { default_max_retries: 3 },
 * };
 * ```
 */
export const CreateQueueRequestSchema = z
	.object({
		name: z.string().optional().describe('Optional queue name (auto-generated if not provided).'),
		description: z.string().optional().describe("Optional description of the queue's purpose."),
		queue_type: QueueTypeSchema.describe('Type of queue to create.'),
		settings: QueueSettingsSchemaBase.partial()
			.optional()
			.describe(
				'Optional settings to customize queue behavior (server applies defaults for missing fields).'
			),
	})
	.describe('Create queue request schema');

/** Request type for creating a queue. */
export type CreateQueueRequest = z.infer<typeof CreateQueueRequestSchema>;

/**
 * Request schema for updating an existing queue.
 */
export const UpdateQueueRequestSchema = z
	.object({
		description: z.string().optional().describe('New description for the queue.'),
		settings: QueueSettingsSchemaBase.partial()
			.optional()
			.describe(
				'Settings to update (partial update supported, only provided fields are updated).'
			),
	})
	.describe('Update queue request schema');

/** Request type for updating a queue. */
export type UpdateQueueRequest = z.infer<typeof UpdateQueueRequestSchema>;

/**
 * Request schema for listing queues with pagination.
 */
export const ListQueuesRequestSchema = z
	.object({
		limit: z.number().optional().describe('Maximum number of queues to return.'),
		offset: z.number().optional().describe('Number of queues to skip for pagination.'),
		name: z.string().optional().describe('Filter by queue name substring.'),
		queue_type: QueueTypeSchema.optional().describe('Filter by queue type.'),
		status: z.enum(['active', 'paused']).optional().describe('Filter by queue status.'),
		sort: z
			.enum(['name', 'created', 'updated', 'message_count', 'dlq_count'])
			.optional()
			.describe('Field to sort by.'),
		direction: z.enum(['asc', 'desc']).optional().describe('Sort direction (asc or desc).'),
	})
	.describe('List queues request schema');

/** Request type for listing queues. */
export type ListQueuesRequest = z.infer<typeof ListQueuesRequestSchema>;

/**
 * Request schema for publishing a message to a queue.
 *
 * @example
 * ```typescript
 * const request: PublishMessageRequest = {
 *   payload: { task: 'process-order', orderId: 123 },
 *   metadata: { priority: 'high' },
 *   idempotency_key: 'order-123-v1',
 *   ttl_seconds: 3600,
 * };
 * ```
 */
export const PublishMessageRequestSchema = z
	.object({
		payload: z.unknown().describe('The message payload (JSON object).'),
		metadata: z
			.record(z.string(), z.unknown())
			.optional()
			.describe('Optional metadata to attach to the message.'),
		idempotency_key: z
			.string()
			.optional()
			.describe('Optional key for deduplication (prevents duplicate messages).'),
		partition_key: z
			.string()
			.optional()
			.describe('Optional key for message ordering within a partition.'),
		ttl_seconds: z.number().optional().describe('Optional time-to-live in seconds.'),
	})
	.describe('Publish message request schema');

/** Request type for publishing a message. */
export type PublishMessageRequest = z.infer<typeof PublishMessageRequestSchema>;

/**
 * Request schema for batch publishing multiple messages.
 *
 * @example
 * ```typescript
 * const request: BatchPublishMessagesRequest = {
 *   messages: [
 *     { payload: { task: 'a' } },
 *     { payload: { task: 'b' } },
 *   ],
 * };
 * ```
 */
export const BatchPublishMessagesRequestSchema = z
	.object({
		messages: z
			.array(PublishMessageRequestSchema)
			.max(1000)
			.describe('Array of messages to publish (max 1000 per batch).'),
	})
	.describe('Batch publish messages request schema');

/** Request type for batch publishing messages. */
export type BatchPublishMessagesRequest = z.infer<typeof BatchPublishMessagesRequestSchema>;

/**
 * Request schema for listing messages with pagination and filtering.
 */
export const ListMessagesRequestSchema = z
	.object({
		limit: z.number().optional().describe('Maximum number of messages to return.'),
		offset: z.number().optional().describe('Number of messages to skip for pagination.'),
		state: MessageStateSchema.optional().describe('Filter messages by state.'),
	})
	.describe('List messages request schema');

/** Request type for listing messages. */
export type ListMessagesRequest = z.infer<typeof ListMessagesRequestSchema>;

/**
 * Request schema for consuming messages from a specific offset.
 */
export const ConsumeMessagesRequestSchema = z
	.object({
		offset: z.number().describe('Starting offset to consume from.'),
		limit: z.number().optional().describe('Maximum number of messages to consume.'),
	})
	.describe('Consume messages request schema');

/** Request type for consuming messages. */
export type ConsumeMessagesRequest = z.infer<typeof ConsumeMessagesRequestSchema>;

/**
 * Request schema for creating a destination webhook.
 *
 * @example
 * ```typescript
 * const request: CreateDestinationRequest = {
 *   destination_type: 'http',
 *   config: {
 *     url: 'https://api.example.com/webhook',
 *     method: 'POST',
 *   },
 *   enabled: true,
 * };
 * ```
 */
export const CreateDestinationRequestSchema = z
	.object({
		name: z.string().describe('Human-readable name for the destination.'),
		description: z.string().optional().describe('Optional description of the destination.'),
		destination_type: DestinationTypeSchema.describe('Type of destination to create.'),
		config: HttpDestinationConfigSchema.describe('HTTP configuration for the destination.'),
		enabled: z
			.boolean()
			.default(true)
			.describe('Whether the destination should be enabled (default: true).'),
	})
	.describe('Create destination request schema');

/** Request type for creating a destination. */
export type CreateDestinationRequest = z.infer<typeof CreateDestinationRequestSchema>;

/**
 * Request schema for updating a destination.
 */
export const UpdateDestinationRequestSchema = z
	.object({
		name: z.string().optional().describe('Updated name for the destination.'),
		description: z
			.string()
			.nullable()
			.optional()
			.describe('Updated description of the destination.'),
		config: HttpDestinationConfigSchema.partial()
			.optional()
			.describe('HTTP configuration updates (partial update supported).'),
		enabled: z.boolean().optional().describe('Enable or disable the destination.'),
	})
	.describe('Update destination request schema');

/** Request type for updating a destination. */
export type UpdateDestinationRequest = z.infer<typeof UpdateDestinationRequestSchema>;

/**
 * Request schema for listing dead letter queue messages with pagination.
 */
export const ListDlqRequestSchema = z
	.object({
		limit: z.number().optional().describe('Maximum number of messages to return.'),
		offset: z.number().optional().describe('Number of messages to skip for pagination.'),
	})
	.describe('List dlq request schema');

/** Request type for listing DLQ messages. */
export type ListDlqRequest = z.infer<typeof ListDlqRequestSchema>;

// ============================================================================
// Analytics Types
// ============================================================================

/**
 * Time bucket granularity for analytics queries.
 *
 * - `minute`: 1-minute buckets, max range 24 hours. Best for real-time monitoring.
 * - `hour`: 1-hour buckets, max range 7 days. Best for short-term trend analysis.
 * - `day`: 1-day buckets, max range 90 days. Best for long-term analysis.
 *
 * @example
 * ```typescript
 * const analytics = await getQueueAnalytics(client, 'my-queue', {
 *   granularity: 'hour',
 *   start: '2026-01-14T00:00:00Z',
 * });
 * ```
 */
export const AnalyticsGranularitySchema = z
	.enum(['minute', 'hour', 'day'])
	.describe('Analytics granularity schema');

/**
 * Time bucket granularity type.
 */
export type AnalyticsGranularity = z.infer<typeof AnalyticsGranularitySchema>;

/**
 * Options for analytics queries.
 *
 * Use these options to filter and configure analytics requests by time range,
 * granularity, and optional filters like project or agent ID.
 *
 * @example
 * ```typescript
 * const options: AnalyticsOptions = {
 *   start: '2026-01-14T00:00:00Z',
 *   end: '2026-01-15T00:00:00Z',
 *   granularity: 'hour',
 *   projectId: 'proj_abc123',
 * };
 * const analytics = await getQueueAnalytics(client, 'my-queue', options);
 * ```
 */
export const AnalyticsOptionsSchema = QueueApiOptionsSchema.extend({
	start: z.string().optional().describe('Start of analytics time range in ISO 8601 format'),
	end: z.string().optional().describe('End of analytics time range in ISO 8601 format'),
	granularity: AnalyticsGranularitySchema.optional().describe('Analytics time bucket granularity'),
	projectId: z.string().optional().describe('Optional project id filter for analytics events'),
	agentId: z.string().optional().describe('Optional agent id filter for analytics events'),
}).describe('Analytics options schema');

export type AnalyticsOptions = z.infer<typeof AnalyticsOptionsSchema>;

/**
 * Options for real-time SSE streaming analytics.
 *
 * SSE (Server-Sent Events) streams provide live updates of queue statistics
 * at a configurable interval. The stream stays open until closed by the client.
 *
 * @example
 * ```typescript
 * const stream = streamQueueAnalytics(client, 'my-queue', { interval: 5 });
 * for await (const event of stream) {
 *   console.log(`Backlog: ${event.backlog}`);
 * }
 * ```
 */
export const StreamAnalyticsOptionsSchema = QueueApiOptionsSchema.extend({
	interval: z.number().optional().describe('Interval between SSE analytics updates in seconds'),
}).describe('Stream analytics options schema');

export type StreamAnalyticsOptions = z.infer<typeof StreamAnalyticsOptionsSchema>;

/**
 * Time period for analytics responses.
 *
 * Represents the time range and granularity of the analytics data.
 */
export const TimePeriodSchema = z
	.object({
		start: z.string().describe('Start of the time period in ISO8601 format.'),
		end: z.string().describe('End of the time period in ISO8601 format.'),
		granularity: AnalyticsGranularitySchema.optional().describe(
			'Time bucket granularity used for aggregation.'
		),
	})
	.describe('Time period schema');

/**
 * Time period type representing a date range for analytics.
 */
export type TimePeriod = z.infer<typeof TimePeriodSchema>;

/**
 * Latency statistics with percentile distributions.
 *
 * Provides average, percentile (p50, p95, p99), and maximum latency values
 * for message delivery operations.
 *
 * @example
 * ```typescript
 * const { latency } = await getQueueAnalytics(client, 'my-queue');
 * console.log(`Average: ${latency.avg_ms}ms, P95: ${latency.p95_ms}ms`);
 * ```
 */
export const LatencyStatsSchema = z
	.object({
		avg_ms: z.number().describe('Average latency in milliseconds.'),
		p50_ms: z.number().optional().describe('50th percentile (median) latency in milliseconds.'),
		p95_ms: z.number().optional().describe('95th percentile latency in milliseconds.'),
		p99_ms: z.number().optional().describe('99th percentile latency in milliseconds.'),
		max_ms: z.number().optional().describe('Maximum observed latency in milliseconds.'),
	})
	.describe('Latency stats schema');

/**
 * Latency statistics type.
 */
export type LatencyStats = z.infer<typeof LatencyStatsSchema>;

/**
 * Current real-time queue state.
 *
 * Represents the instantaneous state of a queue, useful for monitoring
 * dashboards and alerting on queue health.
 *
 * @example
 * ```typescript
 * const { current } = await getQueueAnalytics(client, 'my-queue');
 * if (current.backlog > 1000) {
 *   console.warn('Queue backlog is high!');
 * }
 * ```
 */
export const QueueCurrentStatsSchema = z
	.object({
		backlog: z.number().describe('Number of messages waiting to be processed.'),
		dlq_count: z.number().describe('Number of messages in the dead letter queue.'),
		messages_in_flight: z.number().describe('Number of messages currently leased by consumers.'),
		active_consumers: z.number().describe('Number of active WebSocket/long-poll consumers.'),
		oldest_message_age_seconds: z
			.number()
			.nullable()
			.optional()
			.describe('Age in seconds of the oldest pending message (null if queue is empty).'),
	})
	.describe('Queue current stats schema');

/**
 * Current queue state type.
 */
export type QueueCurrentStats = z.infer<typeof QueueCurrentStatsSchema>;

/**
 * Aggregated statistics for a time period.
 *
 * Contains counts and metrics aggregated over the requested time range.
 *
 * @example
 * ```typescript
 * const { period_stats } = await getQueueAnalytics(client, 'my-queue');
 * const successRate = period_stats.messages_acknowledged / period_stats.messages_published;
 * console.log(`Success rate: ${(successRate * 100).toFixed(1)}%`);
 * ```
 */
export const QueuePeriodStatsSchema = z
	.object({
		messages_published: z.number().describe('Total messages published during the period.'),
		messages_delivered: z
			.number()
			.describe('Total messages delivered to consumers during the period.'),
		messages_acknowledged: z
			.number()
			.describe('Total messages successfully acknowledged during the period.'),
		messages_failed: z
			.number()
			.describe('Total messages that failed and moved to DLQ during the period.'),
		messages_replayed: z.number().describe('Total messages replayed from DLQ during the period.'),
		bytes_published: z
			.number()
			.describe('Total bytes of message payloads published during the period.'),
		delivery_attempts: z
			.number()
			.describe('Total delivery attempts (includes retries) during the period.'),
		retry_count: z
			.number()
			.describe('Number of retry attempts (delivery_attempts - messages_delivered).'),
	})
	.describe('Queue period stats schema');

/**
 * Period statistics type.
 */
export type QueuePeriodStats = z.infer<typeof QueuePeriodStatsSchema>;

/**
 * Analytics for a webhook destination.
 *
 * Provides delivery statistics for a configured webhook endpoint.
 *
 * @example
 * ```typescript
 * const { destinations } = await getQueueAnalytics(client, 'my-queue');
 * for (const dest of destinations ?? []) {
 *   const successRate = dest.success_count / (dest.success_count + dest.failure_count);
 *   console.log(`${dest.url}: ${(successRate * 100).toFixed(1)}% success`);
 * }
 * ```
 */
export const DestinationAnalyticsSchema = z
	.object({
		id: z.string().describe('Unique destination identifier (prefixed with dest_).'),
		type: z.string().describe("Destination type (currently only 'http')."),
		url: z.string().describe('Webhook URL.'),
		success_count: z.number().describe('Total successful deliveries.'),
		failure_count: z.number().describe('Total failed deliveries.'),
		avg_response_time_ms: z
			.number()
			.optional()
			.describe('Average response time in milliseconds.'),
		last_success_at: z
			.string()
			.nullable()
			.optional()
			.describe('ISO8601 timestamp of last successful delivery.'),
		last_failure_at: z
			.string()
			.nullable()
			.optional()
			.describe('ISO8601 timestamp of last failed delivery.'),
	})
	.describe('Destination analytics schema');

/**
 * Destination analytics type.
 */
export type DestinationAnalytics = z.infer<typeof DestinationAnalyticsSchema>;

/**
 * Complete analytics for a single queue.
 *
 * Provides comprehensive analytics including current state, period statistics,
 * latency metrics, and destination performance.
 *
 * @example
 * ```typescript
 * const analytics = await getQueueAnalytics(client, 'order-processing');
 * console.log(`Queue: ${analytics.queue_name} (${analytics.queue_type})`);
 * console.log(`Backlog: ${analytics.current.backlog}`);
 * console.log(`Published (24h): ${analytics.period_stats.messages_published}`);
 * console.log(`P95 Latency: ${analytics.latency.p95_ms}ms`);
 * ```
 */
export const QueueAnalyticsSchema = z
	.object({
		queue_id: z.string().describe('Unique queue identifier (prefixed with queue_).'),
		queue_name: z.string().describe('Human-readable queue name.'),
		queue_type: z.string().describe("Queue type: 'worker' or 'pubsub'."),
		period: TimePeriodSchema.describe('Time period for the analytics data.'),
		current: QueueCurrentStatsSchema.describe('Current real-time queue state.'),
		period_stats: QueuePeriodStatsSchema.describe('Aggregated statistics for the time period.'),
		latency: LatencyStatsSchema.describe('Message delivery latency statistics.'),
		consumer_latency: LatencyStatsSchema.describe(
			'Consumer processing latency (delivery-to-ack time).'
		),
		destinations: z
			.array(DestinationAnalyticsSchema)
			.optional()
			.describe('Analytics for each configured webhook destination.'),
	})
	.describe('Queue analytics schema');

/**
 * Queue analytics type.
 */
export type QueueAnalytics = z.infer<typeof QueueAnalyticsSchema>;

/**
 * Summary statistics for a queue in org-level analytics.
 *
 * Provides a condensed view of queue metrics for listing in dashboards.
 */
export const QueueSummarySchema = z
	.object({
		id: z.string().describe('Unique queue identifier.'),
		name: z.string().describe('Human-readable queue name.'),
		queue_type: z.string().describe("Queue type: 'worker' or 'pubsub'."),
		messages_published: z.number().describe('Messages published during the period.'),
		messages_delivered: z.number().describe('Messages delivered during the period.'),
		messages_acknowledged: z.number().describe('Messages acknowledged during the period.'),
		backlog: z.number().describe('Current pending message count.'),
		dlq_count: z.number().describe('Current dead letter queue count.'),
		avg_latency_ms: z.number().describe('Average delivery latency in milliseconds.'),
		error_rate_percent: z.number().describe('Percentage of messages that failed (0-100).'),
	})
	.describe('Queue summary schema');

/**
 * Queue summary type for org-level listings.
 */
export type QueueSummary = z.infer<typeof QueueSummarySchema>;

/**
 * Aggregated summary across all queues in an organization.
 *
 * @example
 * ```typescript
 * const { summary } = await getOrgAnalytics(client);
 * console.log(`Total queues: ${summary.total_queues}`);
 * console.log(`Total messages: ${summary.total_messages_published}`);
 * console.log(`Error rate: ${summary.error_rate_percent.toFixed(2)}%`);
 * ```
 */
export const OrgAnalyticsSummarySchema = z
	.object({
		total_queues: z.number().describe('Total number of queues in the organization.'),
		total_messages_published: z.number().describe('Total messages published across all queues.'),
		total_messages_delivered: z.number().describe('Total messages delivered across all queues.'),
		total_messages_acknowledged: z
			.number()
			.describe('Total messages acknowledged across all queues.'),
		total_dlq_messages: z.number().describe('Total messages in all dead letter queues.'),
		total_bytes_published: z.number().describe('Total bytes published across all queues.'),
		avg_latency_ms: z
			.number()
			.describe('Average delivery latency across all queues in milliseconds.'),
		p95_latency_ms: z
			.number()
			.describe('95th percentile latency across all queues in milliseconds.'),
		error_rate_percent: z.number().describe('Overall error rate as percentage (0-100).'),
	})
	.describe('Org analytics summary schema');

/**
 * Org-level analytics summary type.
 */
export type OrgAnalyticsSummary = z.infer<typeof OrgAnalyticsSummarySchema>;

/**
 * Complete organization-level analytics.
 *
 * Provides an overview of all queues with aggregated metrics and per-queue summaries.
 *
 * @example
 * ```typescript
 * const analytics = await getOrgAnalytics(client);
 * console.log(`Org: ${analytics.org_id}`);
 * console.log(`Queues: ${analytics.summary.total_queues}`);
 * for (const queue of analytics.queues) {
 *   console.log(`  ${queue.name}: ${queue.backlog} pending`);
 * }
 * ```
 */
export const OrgAnalyticsSchema = z
	.object({
		org_id: z.string().describe('Organization identifier.'),
		period: TimePeriodSchema.describe('Time period for the analytics data.'),
		summary: OrgAnalyticsSummarySchema.describe('Aggregated summary across all queues.'),
		queues: z.array(QueueSummarySchema).describe('Per-queue summary statistics.'),
	})
	.describe('Org analytics schema');

/**
 * Org-level analytics type.
 */
export type OrgAnalytics = z.infer<typeof OrgAnalyticsSchema>;

/**
 * Single data point in a time series.
 *
 * Represents metrics for one time bucket (minute, hour, or day).
 * Used for building charts and visualizing trends over time.
 *
 * @example
 * ```typescript
 * const { series } = await getQueueTimeSeries(client, 'my-queue', { granularity: 'hour' });
 * for (const point of series) {
 *   console.log(`${point.timestamp}: ${point.throughput} msg/h, ${point.avg_latency_ms}ms avg`);
 * }
 * ```
 */
export const TimeSeriesPointSchema = z
	.object({
		timestamp: z.string().describe('ISO8601 timestamp for the start of this time bucket.'),
		throughput: z.number().describe('Messages published during this bucket.'),
		delivery_rate: z.number().describe('Messages delivered during this bucket.'),
		ack_rate: z.number().describe('Messages acknowledged during this bucket.'),
		error_rate: z.number().describe('Messages that failed during this bucket.'),
		avg_latency_ms: z
			.number()
			.describe('Average delivery latency in milliseconds for this bucket.'),
		p95_latency_ms: z
			.number()
			.optional()
			.describe('95th percentile latency in milliseconds for this bucket.'),
		backlog: z
			.number()
			.optional()
			.describe('Queue backlog at the end of this bucket (snapshot).'),
		messages_in_flight: z
			.number()
			.optional()
			.describe('Messages in flight at the end of this bucket (snapshot).'),
	})
	.describe('Time series point schema');

/**
 * Time series data point type.
 */
export type TimeSeriesPoint = z.infer<typeof TimeSeriesPointSchema>;

/**
 * Time series analytics data for charting and visualization.
 *
 * Contains an array of data points at the requested granularity for building
 * time-based charts and dashboards.
 *
 * @example
 * ```typescript
 * const timeseries = await getQueueTimeSeries(client, 'order-processing', {
 *   granularity: 'hour',
 *   start: '2026-01-14T00:00:00Z',
 *   end: '2026-01-15T00:00:00Z',
 * });
 *
 * // Plot throughput over time
 * const chartData = timeseries.series.map(p => ({
 *   x: new Date(p.timestamp),
 *   y: p.throughput,
 * }));
 * ```
 */
export const TimeSeriesDataSchema = z
	.object({
		queue_id: z.string().describe('Unique queue identifier.'),
		queue_name: z.string().describe('Human-readable queue name.'),
		period: TimePeriodSchema.describe('Time period and granularity for the data.'),
		series: z.array(TimeSeriesPointSchema).describe('Array of time-bucketed data points.'),
	})
	.describe('Time series data schema');

/**
 * Time series data type.
 */
export type TimeSeriesData = z.infer<typeof TimeSeriesDataSchema>;

/**
 * Real-time stats event from SSE stream.
 *
 * Represents a single snapshot of queue statistics delivered via Server-Sent Events.
 * Events are pushed at the interval specified when opening the stream.
 *
 * @example
 * ```typescript
 * const stream = streamQueueAnalytics(client, 'my-queue', { interval: 5 });
 * for await (const event of stream) {
 *   updateDashboard({
 *     backlog: event.backlog,
 *     throughput: event.throughput_1m,
 *     latency: event.avg_latency_ms,
 *     consumers: event.active_consumers,
 *   });
 * }
 * ```
 */
export const SSEStatsEventSchema = z
	.object({
		timestamp: z.string().describe('ISO8601 timestamp when this snapshot was taken.'),
		backlog: z.number().describe('Current number of pending messages.'),
		messages_in_flight: z.number().describe('Current number of messages being processed.'),
		throughput_1m: z.number().describe('Messages published in the last minute.'),
		delivery_rate_1m: z.number().describe('Messages delivered in the last minute.'),
		error_rate_1m: z.number().describe('Messages that failed in the last minute.'),
		avg_latency_ms: z.number().describe('Current average delivery latency in milliseconds.'),
		active_consumers: z.number().describe('Current number of connected consumers.'),
	})
	.describe('Sse stats event schema');

/**
 * SSE stats event type for real-time streaming.
 */
export type SSEStatsEvent = z.infer<typeof SSEStatsEventSchema>;

// ============================================================================
// Source Types
// ============================================================================

/**
 * Source authentication type schema.
 */
export const SourceAuthTypeSchema = z
	.enum(['none', 'basic', 'header'])
	.describe('Source auth type schema');

/**
 * Source authentication type.
 */
export type SourceAuthType = z.infer<typeof SourceAuthTypeSchema>;

/**
 * Queue source schema representing an HTTP ingestion endpoint.
 *
 * Sources provide public URLs for ingesting data into queues from external sources.
 * They support various authentication methods to secure access.
 *
 * @example
 * ```typescript
 * const source = await getSource(client, 'my-queue', 'qsrc_abc123');
 * console.log(`Source URL: ${source.url}`);
 * console.log(`Success rate: ${source.success_count}/${source.request_count}`);
 * ```
 */
export const SourceSchema = z
	.object({
		id: z.string().describe('Unique identifier for the source (prefixed with qsrc_).'),
		queue_id: z.string().describe('ID of the queue this source publishes to.'),
		name: z.string().describe('Human-readable source name.'),
		description: z
			.string()
			.nullable()
			.optional()
			.describe("Optional description of the source's purpose."),
		auth_type: SourceAuthTypeSchema.describe('Authentication type for the public endpoint.'),
		enabled: z.boolean().describe('Whether the source is enabled.'),
		url: z.string().describe('Public URL to send data to this source.'),
		request_count: z.number().describe('Total number of requests received.'),
		success_count: z.number().describe('Number of successful ingestions.'),
		failure_count: z.number().describe('Number of failed ingestions.'),
		last_request_at: z
			.string()
			.nullable()
			.optional()
			.describe('ISO 8601 timestamp of last request.'),
		last_success_at: z
			.string()
			.nullable()
			.optional()
			.describe('ISO 8601 timestamp of last success.'),
		last_failure_at: z
			.string()
			.nullable()
			.optional()
			.describe('ISO 8601 timestamp of last failure.'),
		last_failure_error: z
			.string()
			.nullable()
			.optional()
			.describe('Error message from last failure.'),
		created_at: z.string().describe('ISO 8601 timestamp when the source was created.'),
		updated_at: z.string().describe('ISO 8601 timestamp when the source was last updated.'),
	})
	.describe('Source schema');

/**
 * Queue source type.
 */
export type Source = z.infer<typeof SourceSchema>;

/**
 * Create source request schema.
 *
 * @example
 * ```typescript
 * const request: CreateSourceRequest = {
 *   name: 'webhook-ingestion',
 *   description: 'Receives webhooks from external service',
 *   auth_type: 'header',
 *   auth_value: 'Bearer my-secret-token',
 * };
 * ```
 */
export const CreateSourceRequestSchema = z
	.object({
		name: z.string().min(1).max(256).describe('Human-readable name for the source.'),
		description: z.string().max(1024).optional().describe('Optional description.'),
		auth_type: SourceAuthTypeSchema.optional()
			.default('none')
			.describe('Authentication type (default: none).'),
		auth_value: z
			.string()
			.optional()
			.describe('Authentication value (format depends on auth_type).'),
	})
	.describe('Create source request schema');

/**
 * Create source request type.
 */
export type CreateSourceRequest = z.infer<typeof CreateSourceRequestSchema>;

/**
 * Update source request schema.
 *
 * All fields are optional - only provided fields will be updated.
 *
 * @example
 * ```typescript
 * // Disable a source
 * const request: UpdateSourceRequest = { enabled: false };
 *
 * // Update authentication
 * const request: UpdateSourceRequest = {
 *   auth_type: 'basic',
 *   auth_value: 'user:password',
 * };
 * ```
 */
export const UpdateSourceRequestSchema = z
	.object({
		name: z.string().min(1).max(256).optional().describe('New name for the source.'),
		description: z.string().max(1024).nullable().optional().describe('New description.'),
		auth_type: SourceAuthTypeSchema.optional().describe('New authentication type.'),
		auth_value: z.string().optional().describe('New authentication value.'),
		enabled: z.boolean().optional().describe('Whether the source is enabled.'),
	})
	.describe('Update source request schema');

/**
 * Update source request type.
 */
export type UpdateSourceRequest = z.infer<typeof UpdateSourceRequestSchema>;

// ============================================================================
// Source Event Types
// ============================================================================

/**
 * Source event schema representing an inbound request received through a queue source.
 *
 * Source events are logged when external systems send data to a source's public endpoint.
 * They capture the request details, status, and resulting message (if successful).
 *
 * @example
 * ```typescript
 * const { events } = await listSourceEvents(client, 'my-queue', 'qsrc_abc123');
 * for (const event of events) {
 *   console.log(`${event.status}: ${event.message_id ?? 'no message'} at ${event.received_at}`);
 * }
 * ```
 */
export const SourceEventSchema = z
	.object({
		id: z.string().describe('Unique identifier for the event.'),
		source_id: z.string().describe('ID of the source that received the request.'),
		queue_id: z.string().describe('ID of the queue the source belongs to.'),
		message_id: z
			.string()
			.nullable()
			.optional()
			.describe('ID of the message created from this event (null if ingestion failed).'),
		payload: z.unknown().optional().describe('The request payload.'),
		headers: z
			.record(z.string(), z.string())
			.optional()
			.describe('HTTP headers received with the request.'),
		status: z.enum(['success', 'failed']).describe('Status of the ingestion.'),
		error: z.string().nullable().optional().describe('Error message if ingestion failed.'),
		http_status_code: z.number().optional().describe('HTTP status code returned to the sender.'),
		remote_addr: z.string().optional().describe('IP address of the sender.'),
		received_at: z.string().describe('ISO 8601 timestamp when the request was received.'),
		created_at: z.string().describe('ISO 8601 timestamp when the event was created.'),
	})
	.describe('Source event schema');

/** Source event type. */
export type SourceEvent = z.infer<typeof SourceEventSchema>;

/**
 * Request schema for listing source events.
 */
export const ListSourceEventsRequestSchema = z
	.object({
		limit: z.number().optional().describe('Maximum number of events to return (default: 50).'),
		offset: z.number().optional().describe('Number of events to skip for pagination.'),
		status: z.enum(['success', 'failed']).optional().describe('Filter by status.'),
	})
	.describe('List source events request schema');

/** Request type for listing source events. */
export type ListSourceEventsRequest = z.infer<typeof ListSourceEventsRequestSchema>;

// ============================================================================
// Delivery Log Types
// ============================================================================

/**
 * Delivery log schema representing a delivery attempt to a queue destination.
 *
 * Delivery logs track each attempt to deliver a message to a configured
 * webhook destination, including HTTP response details and timing.
 *
 * @example
 * ```typescript
 * const { deliveries } = await listDestinationDeliveries(client, 'my-queue', 'qdest_abc123');
 * for (const d of deliveries) {
 *   console.log(`${d.status} → ${d.http_status_code} (${d.duration_ms}ms)`);
 * }
 * ```
 */
export const DeliveryLogSchema = z
	.object({
		id: z.string().describe('Unique identifier for the delivery attempt.'),
		destination_id: z.string().describe('ID of the destination this delivery was sent to.'),
		queue_id: z.string().describe('ID of the queue.'),
		message_id: z.string().describe('ID of the message that was delivered.'),
		payload: z.unknown().optional().describe('Payload delivered to the destination.'),
		status: z.enum(['success', 'failed', 'pending']).describe('Status of the delivery attempt.'),
		http_status_code: z
			.number()
			.nullable()
			.optional()
			.describe('HTTP status code from the destination.'),
		error: z.string().nullable().optional().describe('Error message if delivery failed.'),
		duration_ms: z
			.number()
			.optional()
			.describe('Duration of the delivery attempt in milliseconds.'),
		attempt_number: z.number().optional().describe('Which attempt number this was (1-based).'),
		request_headers: z
			.record(z.string(), z.string())
			.optional()
			.describe('Request headers sent to the destination.'),
		response_headers: z
			.record(z.string(), z.string())
			.optional()
			.describe('Response headers from the destination.'),
		delivered_at: z.string().describe('ISO 8601 timestamp when the delivery was attempted.'),
		created_at: z.string().describe('ISO 8601 timestamp when the log entry was created.'),
	})
	.describe('Delivery log schema');

/** Delivery log type. */
export type DeliveryLog = z.infer<typeof DeliveryLogSchema>;

/**
 * Request schema for listing destination deliveries.
 */
export const ListDeliveryLogsRequestSchema = z
	.object({
		limit: z
			.number()
			.optional()
			.describe('Maximum number of deliveries to return (default: 50).'),
		offset: z.number().optional().describe('Number of deliveries to skip for pagination.'),
		status: z.enum(['success', 'failed', 'pending']).optional().describe('Filter by status.'),
	})
	.describe('List delivery logs request schema');

/** Request type for listing delivery logs. */
export type ListDeliveryLogsRequest = z.infer<typeof ListDeliveryLogsRequestSchema>;

// ============================================================================
// Consumer Types
// ============================================================================

/**
 * Schema for a queue consumer (WebSocket connection).
 *
 * Consumers represent active or recently disconnected WebSocket connections
 * that receive messages from a queue in real-time.
 *
 * @example
 * ```typescript
 * const consumers = await listConsumers(client, 'my-queue');
 * for (const c of consumers) {
 *   const status = c.disconnected_at ? 'disconnected' : 'connected';
 *   console.log(`Consumer ${c.id}: ${status} (durable: ${c.durable})`);
 * }
 * ```
 */
export const ConsumerSchema = z
	.object({
		id: z.string().describe('Unique consumer identifier (qcns_ prefix).'),
		queue_id: z.string().describe('Queue this consumer is connected to.'),
		client_id: z.string().nullable().optional().describe('Client-provided ID for reconnection.'),
		durable: z.boolean().describe('Whether this consumer uses durable offset tracking.'),
		ip_address: z.string().nullable().optional().describe('IP address of the consumer.'),
		last_offset: z.number().nullable().optional().describe('Last processed message offset.'),
		connected_at: z.string().describe('When the consumer connected.'),
		disconnected_at: z
			.string()
			.nullable()
			.optional()
			.describe('When the consumer disconnected (null if still connected).'),
		created_at: z.string().describe('Record creation timestamp.'),
		updated_at: z.string().describe('Record last update timestamp.'),
	})
	.describe('Consumer schema');

/**
 * Queue consumer type representing a WebSocket connection.
 */
export type Consumer = z.infer<typeof ConsumerSchema>;

// ============================================================================
// WebSocket Types
// ============================================================================

/**
 * WebSocket authentication request.
 * This must be the first message sent after the WebSocket connection is established.
 */
export const WebSocketAuthRequestSchema = z
	.object({
		authorization: z
			.string()
			.describe('The API key for authentication (raw key, not "Bearer ...").'),
		client_id: z
			.string()
			.optional()
			.describe('Optional client ID from a previous connection for reconnection.'),
		last_offset: z
			.number()
			.optional()
			.describe('Offset of the last message successfully processed. Server replays from here.'),
	})
	.describe('Web socket auth request schema');

export type WebSocketAuthRequest = z.infer<typeof WebSocketAuthRequestSchema>;

/**
 * WebSocket authentication response from the server.
 */
export const WebSocketAuthResponseSchema = z
	.object({
		success: z.boolean().describe('Whether authentication was successful.'),
		error: z.string().optional().describe('Error message if authentication failed.'),
		client_id: z
			.string()
			.optional()
			.describe(
				'The client/subscription ID assigned to this connection. Store and reuse on reconnect.'
			),
	})
	.describe('Web socket auth response schema');

export type WebSocketAuthResponse = z.infer<typeof WebSocketAuthResponseSchema>;

/**
 * WebSocket message pushed by the server.
 *
 * Messages are always delivered as an array. A single live push contains one
 * element (`type: "message"`), while a replay batch may contain many
 * (`type: "replay"`).
 */
export const WebSocketMessageSchema = z
	.object({
		type: z
			.enum(['message', 'replay'])
			.describe(
				'Message type — "message" for live pushes, "replay" for reconnect replay batches.'
			),
		queue_id: z.string().describe('Queue ID the messages belong to.'),
		messages: z
			.array(MessageSchema)
			.describe('The queue messages. Always an array — single live pushes contain one element.'),
	})
	.describe('Web socket message schema');

export type WebSocketMessage = z.infer<typeof WebSocketMessageSchema>;
