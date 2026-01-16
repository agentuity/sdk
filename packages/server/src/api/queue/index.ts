/**
 * @module queue
 *
 * Queue API client for managing message queues, messages, destinations, and dead letter queues.
 *
 * This module provides a complete client for the Agentuity Queue API, supporting:
 * - **Queue Management**: Create, read, update, and delete message queues
 * - **Message Operations**: Publish, consume, acknowledge, and manage messages
 * - **Destinations**: Configure webhook endpoints for automatic message delivery
 * - **Dead Letter Queue**: Handle failed messages that exceeded retry limits
 *
 * @example Basic Queue Operations
 * ```typescript
 * import { createQueue, publishMessage, receiveMessage, ackMessage } from '@agentuity/server';
 *
 * // Create a worker queue
 * const queue = await createQueue(client, {
 *   name: 'order-processing',
 *   queue_type: 'worker',
 * });
 *
 * // Publish a message
 * await publishMessage(client, 'order-processing', {
 *   payload: { orderId: 123 },
 * });
 *
 * // Receive and acknowledge a message
 * const message = await receiveMessage(client, 'order-processing');
 * if (message) {
 *   // Process the message...
 *   await ackMessage(client, 'order-processing', message.id);
 * }
 * ```
 *
 * @example Webhook Destinations
 * ```typescript
 * import { createDestination } from '@agentuity/server';
 *
 * // Messages are automatically delivered to this URL
 * await createDestination(client, 'order-processing', {
 *   destination_type: 'http',
 *   config: { url: 'https://api.example.com/webhook' },
 * });
 * ```
 */

// ============================================================================
// Types & Schemas
// ============================================================================

export {
	QueueTypeSchema,
	QueueSettingsSchema,
	QueueStatsSchema,
	QueueSchema,
	MessageStateSchema,
	MessageSchema,
	DestinationTypeSchema,
	HttpDestinationConfigSchema,
	DestinationStatsSchema,
	DestinationSchema,
	DeadLetterMessageSchema,
	CreateQueueRequestSchema,
	UpdateQueueRequestSchema,
	ListQueuesRequestSchema,
	PublishMessageRequestSchema,
	BatchPublishMessagesRequestSchema,
	ListMessagesRequestSchema,
	ConsumeMessagesRequestSchema,
	CreateDestinationRequestSchema,
	UpdateDestinationRequestSchema,
	ListDlqRequestSchema,
	type QueueType,
	type QueueSettings,
	type QueueStats,
	type Queue,
	type MessageState,
	type Message,
	type DestinationType,
	type HttpDestinationConfig,
	type DestinationStats,
	type Destination,
	type DeadLetterMessage,
	type CreateQueueRequest,
	type UpdateQueueRequest,
	type ListQueuesRequest,
	type PublishMessageRequest,
	type BatchPublishMessagesRequest,
	type ListMessagesRequest,
	type ConsumeMessagesRequest,
	type CreateDestinationRequest,
	type UpdateDestinationRequest,
	type ListDlqRequest,
	type QueueApiOptions,
	// Analytics types
	AnalyticsGranularitySchema,
	TimePeriodSchema,
	LatencyStatsSchema,
	QueueCurrentStatsSchema,
	QueuePeriodStatsSchema,
	DestinationAnalyticsSchema,
	QueueAnalyticsSchema,
	QueueSummarySchema,
	OrgAnalyticsSummarySchema,
	OrgAnalyticsSchema,
	TimeSeriesPointSchema,
	TimeSeriesDataSchema,
	SSEStatsEventSchema,
	type AnalyticsGranularity,
	type AnalyticsOptions,
	type StreamAnalyticsOptions,
	type TimePeriod,
	type LatencyStats,
	type QueueCurrentStats,
	type QueuePeriodStats,
	type DestinationAnalytics,
	type QueueAnalytics,
	type QueueSummary,
	type OrgAnalyticsSummary,
	type OrgAnalytics,
	type TimeSeriesPoint,
	type TimeSeriesData,
	type SSEStatsEvent,
	// Source types
	SourceAuthTypeSchema,
	SourceSchema,
	CreateSourceRequestSchema,
	UpdateSourceRequestSchema,
	type SourceAuthType,
	type Source,
	type CreateSourceRequest,
	type UpdateSourceRequest,
} from './types';

// ============================================================================
// Errors
// ============================================================================

export {
	QueueError,
	QueueNotFoundError,
	MessageNotFoundError,
	DestinationNotFoundError,
	DestinationAlreadyExistsError,
	QueueInvalidArgumentError,
	SourceNotFoundError,
	SourceAlreadyExistsError,
} from './util';

// ============================================================================
// Queue Operations
// ============================================================================

export {
	createQueue,
	getQueue,
	listQueues,
	updateQueue,
	deleteQueue,
	pauseQueue,
	resumeQueue,
} from './queues';

// ============================================================================
// Message Operations
// ============================================================================

export {
	publishMessage,
	batchPublishMessages,
	getMessage,
	getMessageByOffset,
	listMessages,
	deleteMessage,
	replayMessage,
	consumeMessages,
	getQueueHead,
	getQueueTail,
	receiveMessage,
	ackMessage,
	nackMessage,
} from './messages';

// ============================================================================
// Dead Letter Queue Operations
// ============================================================================

export {
	listDeadLetterMessages,
	replayDeadLetterMessage,
	purgeDeadLetter,
	deleteDeadLetterMessage,
} from './dlq';

// ============================================================================
// Destination Operations
// ============================================================================

export {
	createDestination,
	listDestinations,
	updateDestination,
	deleteDestination,
} from './destinations';

// ============================================================================
// Source Operations
// ============================================================================

export { createSource, listSources, getSource, updateSource, deleteSource } from './sources';

// ============================================================================
// Analytics Operations
// ============================================================================

export {
	getOrgAnalytics,
	getQueueAnalytics,
	getQueueTimeSeries,
	streamOrgAnalytics,
	streamQueueAnalytics,
} from './analytics';

// ============================================================================
// Validation Utilities
// ============================================================================

export {
	QueueValidationError,
	validateQueueName,
	validateQueueType,
	validatePayload,
	validateMessageId,
	validateDestinationId,
	validateDescription,
	validatePartitionKey,
	validateIdempotencyKey,
	validateTTL,
	validateVisibilityTimeout,
	validateMaxRetries,
	validateMaxInFlight,
	validateOffset,
	validateLimit,
	validateBatchSize,
	validateWebhookUrl,
	validateDestinationConfig,
	validateSourceId,
	validateSourceName,
	MAX_QUEUE_NAME_LENGTH,
	MIN_QUEUE_NAME_LENGTH,
	MAX_PAYLOAD_SIZE,
	MAX_DESCRIPTION_LENGTH,
	MAX_BATCH_SIZE,
	MAX_METADATA_SIZE,
	MAX_PARTITION_KEY_LENGTH,
	MAX_IDEMPOTENCY_KEY_LENGTH,
	MAX_VISIBILITY_TIMEOUT,
	MAX_RETRIES,
	MAX_IN_FLIGHT,
	MAX_SOURCE_NAME_LENGTH,
} from './validation';
