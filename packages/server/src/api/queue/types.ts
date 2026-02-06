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
export const QueueTypeSchema = z.enum(['worker', 'pubsub']);

/**
 * Queue type - either 'worker' for task queues or 'pubsub' for broadcast messaging.
 */
export type QueueType = z.infer<typeof QueueTypeSchema>;

/**
 * Base queue settings schema without defaults - used for partial updates.
 *
 * This schema is used for PATCH operations where we don't want Zod to apply
 * default values for missing fields (which would overwrite existing values).
 */
const QueueSettingsSchemaBase = z.object({
	/** Default time-to-live for messages in seconds. Null means no expiration. */
	default_ttl_seconds: z.number().nullable().optional(),
	/** Time in seconds a message is invisible after being received. */
	default_visibility_timeout_seconds: z.number().optional(),
	/** Maximum number of delivery attempts before moving to DLQ. */
	default_max_retries: z.number().optional(),
	/** Initial backoff delay in milliseconds for retries. */
	default_retry_backoff_ms: z.number().optional(),
	/** Maximum backoff delay in milliseconds for retries. */
	default_retry_max_backoff_ms: z.number().optional(),
	/** Multiplier for exponential backoff. */
	default_retry_multiplier: z.number().optional(),
	/** Maximum number of messages a single client can process concurrently. */
	max_in_flight_per_client: z.number().optional(),
	/** Retention period for acknowledged messages in seconds. */
	retention_seconds: z.number().optional(),
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
export const QueueSettingsSchema = z.object({
	/** Default time-to-live for messages in seconds. Null means no expiration. */
	default_ttl_seconds: z.number().nullable().optional(),
	/** Time in seconds a message is invisible after being received (default: 30). */
	default_visibility_timeout_seconds: z.number().default(30),
	/** Maximum number of delivery attempts before moving to DLQ (default: 5). */
	default_max_retries: z.number().default(5),
	/** Initial backoff delay in milliseconds for retries (default: 1000). */
	default_retry_backoff_ms: z.number().default(1000),
	/** Maximum backoff delay in milliseconds for retries (default: 60000). */
	default_retry_max_backoff_ms: z.number().default(60000),
	/** Multiplier for exponential backoff (default: 2.0). */
	default_retry_multiplier: z.number().default(2.0),
	/** Maximum number of messages a single client can process concurrently (default: 10). */
	max_in_flight_per_client: z.number().default(10),
	/** Retention period for acknowledged messages in seconds (default: 30 days). */
	retention_seconds: z.number().default(2592000),
});

/**
 * Queue settings configuration type.
 */
export type QueueSettings = z.infer<typeof QueueSettingsSchema>;

/**
 * Queue statistics schema showing current queue state.
 */
export const QueueStatsSchema = z.object({
	/** Total number of messages currently in the queue. */
	message_count: z.number(),
	/** Number of messages in the dead letter queue. */
	dlq_count: z.number(),
	/** The next offset that will be assigned to a new message. */
	next_offset: z.number(),
});

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
export const QueueSchema = z.object({
	/** Unique identifier for the queue. */
	id: z.string(),
	/** Human-readable queue name (used for API operations). */
	name: z.string(),
	/** Optional description of the queue's purpose. */
	description: z.string().nullable().optional(),
	/** The type of queue (worker or pubsub). */
	queue_type: QueueTypeSchema,
	/** Default time-to-live for messages in seconds. Null means no expiration. */
	default_ttl_seconds: z.number().nullable().optional(),
	/** Time in seconds a message is invisible after being received. */
	default_visibility_timeout_seconds: z.number().optional(),
	/** Maximum number of delivery attempts before moving to DLQ. */
	default_max_retries: z.number().optional(),
	/** Initial backoff delay in milliseconds for retries. */
	default_retry_backoff_ms: z.number().optional(),
	/** Maximum backoff delay in milliseconds for retries. */
	default_retry_max_backoff_ms: z.number().optional(),
	/** Multiplier for exponential backoff. */
	default_retry_multiplier: z.number().optional(),
	/** Maximum number of messages a single client can process concurrently. */
	max_in_flight_per_client: z.number().optional(),
	/** The next offset that will be assigned to a new message. */
	next_offset: z.number().optional(),
	/** Total number of messages currently in the queue. */
	message_count: z.number().optional(),
	/** Number of messages in the dead letter queue. */
	dlq_count: z.number().optional(),
	/** ISO 8601 timestamp when the queue was created. */
	created_at: z.string(),
	/** ISO 8601 timestamp when the queue was last updated. */
	updated_at: z.string(),
	/** ISO 8601 timestamp when the queue was paused (null if not paused). */
	paused_at: z.string().nullable().optional(),
	/** Retention period for acknowledged messages in seconds. */
	retention_seconds: z.number().optional(),
});

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
export const MessageStateSchema = z.enum([
	'pending',
	'leased',
	'processing',
	'delivered',
	'failed',
	'dead',
]);

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
export const MessageSchema = z.object({
	/** Unique identifier for the message (prefixed with msg_). */
	id: z.string(),
	/** ID of the queue this message belongs to. */
	queue_id: z.string(),
	/** Sequential offset within the queue. */
	offset: z.number(),
	/** The message payload (JSON object). */
	payload: z.unknown(),
	/** Size of the message payload in bytes. */
	size: z.number().optional(),
	/** Optional metadata attached to the message. */
	metadata: z.record(z.string(), z.unknown()).nullable().optional(),
	/** Current state of the message. */
	state: MessageStateSchema.optional(),
	/** Optional key for message deduplication. */
	idempotency_key: z.string().nullable().optional(),
	/** Optional key for message ordering. */
	partition_key: z.string().nullable().optional(),
	/** Time-to-live in seconds (null means no expiration). */
	ttl_seconds: z.number().nullable().optional(),
	/** Number of times delivery has been attempted. */
	delivery_attempts: z.number().optional(),
	/** Maximum number of delivery attempts allowed. */
	max_retries: z.number().optional(),
	/** ISO 8601 timestamp when the message was published. */
	published_at: z.string().optional(),
	/** ISO 8601 timestamp when the message will expire (if TTL set). */
	expires_at: z.string().nullable().optional(),
	/** ISO 8601 timestamp when the message was delivered. */
	delivered_at: z.string().nullable().optional(),
	/** ISO 8601 timestamp when the message was acknowledged. */
	acknowledged_at: z.string().nullable().optional(),
	/** ISO 8601 timestamp when the message was created. */
	created_at: z.string().optional(),
	/** ISO 8601 timestamp when the message was last updated. */
	updated_at: z.string().optional(),
});

/**
 * Message type representing a queue message.
 */
export type Message = z.infer<typeof MessageSchema>;

/**
 * Destination type schema. Currently only HTTP webhooks are supported.
 */
export const DestinationTypeSchema = z.enum(['http']);

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
export const HttpDestinationConfigSchema = z.object({
	/** The URL to send messages to. */
	url: z.string(),
	/** Optional custom headers to include in requests. */
	headers: z.record(z.string(), z.string()).optional(),
	/** HTTP method to use (default: POST). */
	method: z.string().default('POST'),
	/** Request timeout in milliseconds (default: 30000). */
	timeout_ms: z.number().default(30000),
	/** Optional retry policy for failed deliveries. */
	retry_policy: z
		.object({
			/** Maximum number of delivery attempts (default: 5). */
			max_attempts: z.number().default(5),
			/** Initial backoff delay in milliseconds (default: 1000). */
			initial_backoff_ms: z.number().default(1000),
			/** Maximum backoff delay in milliseconds (default: 60000). */
			max_backoff_ms: z.number().default(60000),
			/** Backoff multiplier for exponential backoff (default: 2.0). */
			backoff_multiplier: z.number().default(2.0),
		})
		.optional(),
	/** Optional request signing configuration. */
	signing: z
		.object({
			/** Whether signing is enabled (default: false). */
			enabled: z.boolean().default(false),
			/** Secret key for HMAC signing. */
			secret_key: z.string().optional(),
		})
		.optional(),
});

/**
 * HTTP destination configuration type.
 */
export type HttpDestinationConfig = z.infer<typeof HttpDestinationConfigSchema>;

/**
 * Destination statistics schema showing delivery metrics.
 */
export const DestinationStatsSchema = z.object({
	/** Total number of delivery attempts. */
	total_deliveries: z.number(),
	/** Number of successful deliveries. */
	successful_deliveries: z.number(),
	/** Number of failed deliveries. */
	failed_deliveries: z.number(),
	/** ISO 8601 timestamp of the last delivery attempt. */
	last_delivery_at: z.string().nullable().optional(),
	/** ISO 8601 timestamp of the last successful delivery. */
	last_success_at: z.string().nullable().optional(),
	/** ISO 8601 timestamp of the last failed delivery. */
	last_failure_at: z.string().nullable().optional(),
});

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
export const DestinationSchema = z.object({
	/** Unique identifier for the destination (prefixed with dest_). */
	id: z.string(),
	/** ID of the queue this destination is attached to. */
	queue_id: z.string(),
	/** Type of destination (currently only 'http'). */
	destination_type: DestinationTypeSchema,
	/** HTTP configuration for the destination. */
	config: HttpDestinationConfigSchema,
	/** Whether the destination is enabled for delivery. */
	enabled: z.boolean(),
	/** Delivery statistics for this destination. */
	stats: DestinationStatsSchema.optional(),
	/** ISO 8601 timestamp when the destination was created. */
	created_at: z.string(),
	/** ISO 8601 timestamp when the destination was last updated. */
	updated_at: z.string(),
});

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
export const DeadLetterMessageSchema = z.object({
	/** Unique identifier for the DLQ entry. */
	id: z.string(),
	/** ID of the queue this message belongs to. */
	queue_id: z.string(),
	/** ID of the original message that failed (optional until backend includes it). */
	original_message_id: z.string().optional(),
	/** Offset of the original message in the queue. */
	offset: z.number(),
	/** The message payload (JSON object). */
	payload: z.unknown(),
	/** Optional metadata from the original message. */
	metadata: z.record(z.string(), z.unknown()).nullable().optional(),
	/** Reason why the message was moved to DLQ. */
	failure_reason: z.string().nullable().optional(),
	/** Number of delivery attempts before failure. */
	delivery_attempts: z.number(),
	/** ISO 8601 timestamp when the message was moved to DLQ (optional until backend includes it). */
	moved_at: z.string().optional(),
	/** ISO 8601 timestamp when the original message was published (optional, falls back to published_at). */
	original_published_at: z.string().optional(),
	/** ISO 8601 timestamp when the message was published (from base message). */
	published_at: z.string().optional(),
	/** ISO 8601 timestamp when the DLQ entry was created. */
	created_at: z.string(),
});

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
export interface QueueApiOptions {
	/**
	 * Organization ID for the request.
	 * Required when using user authentication (CLI) instead of SDK key.
	 */
	orgId?: string;

	/**
	 * Whether to publish synchronously.
	 * When true, the API waits for the message to be fully persisted before returning.
	 * When false (default), the API returns immediately with a pending message.
	 */
	sync?: boolean;
}

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
export const CreateQueueRequestSchema = z.object({
	/** Optional queue name (auto-generated if not provided). */
	name: z.string().optional(),
	/** Optional description of the queue's purpose. */
	description: z.string().optional(),
	/** Type of queue to create. */
	queue_type: QueueTypeSchema,
	/** Optional settings to customize queue behavior (server applies defaults for missing fields). */
	settings: QueueSettingsSchemaBase.partial().optional(),
});

/** Request type for creating a queue. */
export type CreateQueueRequest = z.infer<typeof CreateQueueRequestSchema>;

/**
 * Request schema for updating an existing queue.
 */
export const UpdateQueueRequestSchema = z.object({
	/** New description for the queue. */
	description: z.string().optional(),
	/** Settings to update (partial update supported, only provided fields are updated). */
	settings: QueueSettingsSchemaBase.partial().optional(),
});

/** Request type for updating a queue. */
export type UpdateQueueRequest = z.infer<typeof UpdateQueueRequestSchema>;

/**
 * Request schema for listing queues with pagination.
 */
export const ListQueuesRequestSchema = z.object({
	/** Maximum number of queues to return. */
	limit: z.number().optional(),
	/** Number of queues to skip for pagination. */
	offset: z.number().optional(),
});

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
export const PublishMessageRequestSchema = z.object({
	/** The message payload (JSON object). */
	payload: z.unknown(),
	/** Optional metadata to attach to the message. */
	metadata: z.record(z.string(), z.unknown()).optional(),
	/** Optional key for deduplication (prevents duplicate messages). */
	idempotency_key: z.string().optional(),
	/** Optional key for message ordering within a partition. */
	partition_key: z.string().optional(),
	/** Optional time-to-live in seconds. */
	ttl_seconds: z.number().optional(),
});

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
export const BatchPublishMessagesRequestSchema = z.object({
	/** Array of messages to publish (max 1000 per batch). */
	messages: z.array(PublishMessageRequestSchema).max(1000),
});

/** Request type for batch publishing messages. */
export type BatchPublishMessagesRequest = z.infer<typeof BatchPublishMessagesRequestSchema>;

/**
 * Request schema for listing messages with pagination and filtering.
 */
export const ListMessagesRequestSchema = z.object({
	/** Maximum number of messages to return. */
	limit: z.number().optional(),
	/** Number of messages to skip for pagination. */
	offset: z.number().optional(),
	/** Filter messages by state. */
	state: MessageStateSchema.optional(),
});

/** Request type for listing messages. */
export type ListMessagesRequest = z.infer<typeof ListMessagesRequestSchema>;

/**
 * Request schema for consuming messages from a specific offset.
 */
export const ConsumeMessagesRequestSchema = z.object({
	/** Starting offset to consume from. */
	offset: z.number(),
	/** Maximum number of messages to consume. */
	limit: z.number().optional(),
});

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
export const CreateDestinationRequestSchema = z.object({
	/** Type of destination to create. */
	destination_type: DestinationTypeSchema,
	/** HTTP configuration for the destination. */
	config: HttpDestinationConfigSchema,
	/** Whether the destination should be enabled (default: true). */
	enabled: z.boolean().default(true),
});

/** Request type for creating a destination. */
export type CreateDestinationRequest = z.infer<typeof CreateDestinationRequestSchema>;

/**
 * Request schema for updating a destination.
 */
export const UpdateDestinationRequestSchema = z.object({
	/** HTTP configuration updates (partial update supported). */
	config: HttpDestinationConfigSchema.partial().optional(),
	/** Enable or disable the destination. */
	enabled: z.boolean().optional(),
});

/** Request type for updating a destination. */
export type UpdateDestinationRequest = z.infer<typeof UpdateDestinationRequestSchema>;

/**
 * Request schema for listing dead letter queue messages with pagination.
 */
export const ListDlqRequestSchema = z.object({
	/** Maximum number of messages to return. */
	limit: z.number().optional(),
	/** Number of messages to skip for pagination. */
	offset: z.number().optional(),
});

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
export const AnalyticsGranularitySchema = z.enum(['minute', 'hour', 'day']);

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
export interface AnalyticsOptions extends QueueApiOptions {
	/**
	 * Start of time range in ISO8601 format.
	 * @default 24 hours ago
	 * @example '2026-01-14T00:00:00Z'
	 */
	start?: string;

	/**
	 * End of time range in ISO8601 format.
	 * @default Current time
	 * @example '2026-01-15T00:00:00Z'
	 */
	end?: string;

	/**
	 * Time bucket granularity for aggregation.
	 * @default 'hour'
	 */
	granularity?: AnalyticsGranularity;

	/**
	 * Filter analytics to messages from a specific project.
	 * Only messages with matching `project_id` will be included.
	 */
	projectId?: string;

	/**
	 * Filter analytics to messages from a specific agent.
	 * Only messages with matching `agent_id` will be included.
	 */
	agentId?: string;
}

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
export interface StreamAnalyticsOptions extends QueueApiOptions {
	/**
	 * Interval between stats updates in seconds.
	 * @default 5
	 * @minimum 1
	 * @maximum 60
	 */
	interval?: number;
}

/**
 * Time period for analytics responses.
 *
 * Represents the time range and granularity of the analytics data.
 */
export const TimePeriodSchema = z.object({
	/** Start of the time period in ISO8601 format. */
	start: z.string(),
	/** End of the time period in ISO8601 format. */
	end: z.string(),
	/** Time bucket granularity used for aggregation. */
	granularity: AnalyticsGranularitySchema.optional(),
});

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
export const LatencyStatsSchema = z.object({
	/** Average latency in milliseconds. */
	avg_ms: z.number(),
	/** 50th percentile (median) latency in milliseconds. */
	p50_ms: z.number().optional(),
	/** 95th percentile latency in milliseconds. */
	p95_ms: z.number().optional(),
	/** 99th percentile latency in milliseconds. */
	p99_ms: z.number().optional(),
	/** Maximum observed latency in milliseconds. */
	max_ms: z.number().optional(),
});

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
export const QueueCurrentStatsSchema = z.object({
	/** Number of messages waiting to be processed. */
	backlog: z.number(),
	/** Number of messages in the dead letter queue. */
	dlq_count: z.number(),
	/** Number of messages currently leased by consumers. */
	messages_in_flight: z.number(),
	/** Number of active WebSocket/long-poll consumers. */
	active_consumers: z.number(),
	/** Age in seconds of the oldest pending message (null if queue is empty). */
	oldest_message_age_seconds: z.number().nullable().optional(),
});

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
export const QueuePeriodStatsSchema = z.object({
	/** Total messages published during the period. */
	messages_published: z.number(),
	/** Total messages delivered to consumers during the period. */
	messages_delivered: z.number(),
	/** Total messages successfully acknowledged during the period. */
	messages_acknowledged: z.number(),
	/** Total messages that failed and moved to DLQ during the period. */
	messages_failed: z.number(),
	/** Total messages replayed from DLQ during the period. */
	messages_replayed: z.number(),
	/** Total bytes of message payloads published during the period. */
	bytes_published: z.number(),
	/** Total delivery attempts (includes retries) during the period. */
	delivery_attempts: z.number(),
	/** Number of retry attempts (delivery_attempts - messages_delivered). */
	retry_count: z.number(),
});

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
export const DestinationAnalyticsSchema = z.object({
	/** Unique destination identifier (prefixed with dest_). */
	id: z.string(),
	/** Destination type (currently only 'http'). */
	type: z.string(),
	/** Webhook URL. */
	url: z.string(),
	/** Total successful deliveries. */
	success_count: z.number(),
	/** Total failed deliveries. */
	failure_count: z.number(),
	/** Average response time in milliseconds. */
	avg_response_time_ms: z.number().optional(),
	/** ISO8601 timestamp of last successful delivery. */
	last_success_at: z.string().nullable().optional(),
	/** ISO8601 timestamp of last failed delivery. */
	last_failure_at: z.string().nullable().optional(),
});

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
export const QueueAnalyticsSchema = z.object({
	/** Unique queue identifier (prefixed with queue_). */
	queue_id: z.string(),
	/** Human-readable queue name. */
	queue_name: z.string(),
	/** Queue type: 'worker' or 'pubsub'. */
	queue_type: z.string(),
	/** Time period for the analytics data. */
	period: TimePeriodSchema,
	/** Current real-time queue state. */
	current: QueueCurrentStatsSchema,
	/** Aggregated statistics for the time period. */
	period_stats: QueuePeriodStatsSchema,
	/** Message delivery latency statistics. */
	latency: LatencyStatsSchema,
	/** Consumer processing latency (delivery-to-ack time). */
	consumer_latency: LatencyStatsSchema,
	/** Analytics for each configured webhook destination. */
	destinations: z.array(DestinationAnalyticsSchema).optional(),
});

/**
 * Queue analytics type.
 */
export type QueueAnalytics = z.infer<typeof QueueAnalyticsSchema>;

/**
 * Summary statistics for a queue in org-level analytics.
 *
 * Provides a condensed view of queue metrics for listing in dashboards.
 */
export const QueueSummarySchema = z.object({
	/** Unique queue identifier. */
	id: z.string(),
	/** Human-readable queue name. */
	name: z.string(),
	/** Queue type: 'worker' or 'pubsub'. */
	queue_type: z.string(),
	/** Messages published during the period. */
	messages_published: z.number(),
	/** Messages delivered during the period. */
	messages_delivered: z.number(),
	/** Messages acknowledged during the period. */
	messages_acknowledged: z.number(),
	/** Current pending message count. */
	backlog: z.number(),
	/** Current dead letter queue count. */
	dlq_count: z.number(),
	/** Average delivery latency in milliseconds. */
	avg_latency_ms: z.number(),
	/** Percentage of messages that failed (0-100). */
	error_rate_percent: z.number(),
});

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
export const OrgAnalyticsSummarySchema = z.object({
	/** Total number of queues in the organization. */
	total_queues: z.number(),
	/** Total messages published across all queues. */
	total_messages_published: z.number(),
	/** Total messages delivered across all queues. */
	total_messages_delivered: z.number(),
	/** Total messages acknowledged across all queues. */
	total_messages_acknowledged: z.number(),
	/** Total messages in all dead letter queues. */
	total_dlq_messages: z.number(),
	/** Total bytes published across all queues. */
	total_bytes_published: z.number(),
	/** Average delivery latency across all queues in milliseconds. */
	avg_latency_ms: z.number(),
	/** 95th percentile latency across all queues in milliseconds. */
	p95_latency_ms: z.number(),
	/** Overall error rate as percentage (0-100). */
	error_rate_percent: z.number(),
});

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
export const OrgAnalyticsSchema = z.object({
	/** Organization identifier. */
	org_id: z.string(),
	/** Time period for the analytics data. */
	period: TimePeriodSchema,
	/** Aggregated summary across all queues. */
	summary: OrgAnalyticsSummarySchema,
	/** Per-queue summary statistics. */
	queues: z.array(QueueSummarySchema),
});

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
export const TimeSeriesPointSchema = z.object({
	/** ISO8601 timestamp for the start of this time bucket. */
	timestamp: z.string(),
	/** Messages published during this bucket. */
	throughput: z.number(),
	/** Messages delivered during this bucket. */
	delivery_rate: z.number(),
	/** Messages acknowledged during this bucket. */
	ack_rate: z.number(),
	/** Messages that failed during this bucket. */
	error_rate: z.number(),
	/** Average delivery latency in milliseconds for this bucket. */
	avg_latency_ms: z.number(),
	/** 95th percentile latency in milliseconds for this bucket. */
	p95_latency_ms: z.number().optional(),
	/** Queue backlog at the end of this bucket (snapshot). */
	backlog: z.number().optional(),
	/** Messages in flight at the end of this bucket (snapshot). */
	messages_in_flight: z.number().optional(),
});

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
export const TimeSeriesDataSchema = z.object({
	/** Unique queue identifier. */
	queue_id: z.string(),
	/** Human-readable queue name. */
	queue_name: z.string(),
	/** Time period and granularity for the data. */
	period: TimePeriodSchema,
	/** Array of time-bucketed data points. */
	series: z.array(TimeSeriesPointSchema),
});

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
export const SSEStatsEventSchema = z.object({
	/** ISO8601 timestamp when this snapshot was taken. */
	timestamp: z.string(),
	/** Current number of pending messages. */
	backlog: z.number(),
	/** Current number of messages being processed. */
	messages_in_flight: z.number(),
	/** Messages published in the last minute. */
	throughput_1m: z.number(),
	/** Messages delivered in the last minute. */
	delivery_rate_1m: z.number(),
	/** Messages that failed in the last minute. */
	error_rate_1m: z.number(),
	/** Current average delivery latency in milliseconds. */
	avg_latency_ms: z.number(),
	/** Current number of connected consumers. */
	active_consumers: z.number(),
});

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
export const SourceAuthTypeSchema = z.enum(['none', 'basic', 'header']);

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
export const SourceSchema = z.object({
	/** Unique identifier for the source (prefixed with qsrc_). */
	id: z.string(),
	/** ID of the queue this source publishes to. */
	queue_id: z.string(),
	/** Human-readable source name. */
	name: z.string(),
	/** Optional description of the source's purpose. */
	description: z.string().nullable().optional(),
	/** Authentication type for the public endpoint. */
	auth_type: SourceAuthTypeSchema,
	/** Whether the source is enabled. */
	enabled: z.boolean(),
	/** Public URL to send data to this source. */
	url: z.string(),
	/** Total number of requests received. */
	request_count: z.number(),
	/** Number of successful ingestions. */
	success_count: z.number(),
	/** Number of failed ingestions. */
	failure_count: z.number(),
	/** ISO 8601 timestamp of last request. */
	last_request_at: z.string().nullable().optional(),
	/** ISO 8601 timestamp of last success. */
	last_success_at: z.string().nullable().optional(),
	/** ISO 8601 timestamp of last failure. */
	last_failure_at: z.string().nullable().optional(),
	/** Error message from last failure. */
	last_failure_error: z.string().nullable().optional(),
	/** ISO 8601 timestamp when the source was created. */
	created_at: z.string(),
	/** ISO 8601 timestamp when the source was last updated. */
	updated_at: z.string(),
});

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
export const CreateSourceRequestSchema = z.object({
	/** Human-readable name for the source. */
	name: z.string().min(1).max(256),
	/** Optional description. */
	description: z.string().max(1024).optional(),
	/** Authentication type (default: none). */
	auth_type: SourceAuthTypeSchema.optional().default('none'),
	/** Authentication value (format depends on auth_type). */
	auth_value: z.string().optional(),
});

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
export const UpdateSourceRequestSchema = z.object({
	/** New name for the source. */
	name: z.string().min(1).max(256).optional(),
	/** New description. */
	description: z.string().max(1024).nullable().optional(),
	/** New authentication type. */
	auth_type: SourceAuthTypeSchema.optional(),
	/** New authentication value. */
	auth_value: z.string().optional(),
	/** Whether the source is enabled. */
	enabled: z.boolean().optional(),
});

/**
 * Update source request type.
 */
export type UpdateSourceRequest = z.infer<typeof UpdateSourceRequestSchema>;
