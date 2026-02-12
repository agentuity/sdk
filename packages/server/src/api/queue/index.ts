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
	type AnalyticsGranularity,
	// Analytics types
	AnalyticsGranularitySchema,
	type AnalyticsOptions,
	type BatchPublishMessagesRequest,
	BatchPublishMessagesRequestSchema,
	type ConsumeMessagesRequest,
	ConsumeMessagesRequestSchema,
	type CreateDestinationRequest,
	CreateDestinationRequestSchema,
	type CreateQueueRequest,
	CreateQueueRequestSchema,
	type CreateSourceRequest,
	CreateSourceRequestSchema,
	type DeadLetterMessage,
	DeadLetterMessageSchema,
	type Destination,
	type DestinationAnalytics,
	DestinationAnalyticsSchema,
	DestinationSchema,
	type DestinationStats,
	DestinationStatsSchema,
	type DestinationType,
	DestinationTypeSchema,
	type HttpDestinationConfig,
	HttpDestinationConfigSchema,
	type LatencyStats,
	LatencyStatsSchema,
	type ListDlqRequest,
	ListDlqRequestSchema,
	type ListMessagesRequest,
	ListMessagesRequestSchema,
	type ListQueuesRequest,
	ListQueuesRequestSchema,
	type Message,
	MessageSchema,
	type MessageState,
	MessageStateSchema,
	type OrgAnalytics,
	OrgAnalyticsSchema,
	type OrgAnalyticsSummary,
	OrgAnalyticsSummarySchema,
	type PublishMessageRequest,
	PublishMessageRequestSchema,
	type Queue,
	type QueueAnalytics,
	QueueAnalyticsSchema,
	type QueueApiOptions,
	type QueueCurrentStats,
	QueueCurrentStatsSchema,
	type QueuePeriodStats,
	QueuePeriodStatsSchema,
	QueueSchema,
	type QueueSettings,
	QueueSettingsSchema,
	type QueueStats,
	QueueStatsSchema,
	type QueueSummary,
	QueueSummarySchema,
	type QueueType,
	QueueTypeSchema,
	type Source,
	type SourceAuthType,
	// Source types
	SourceAuthTypeSchema,
	SourceSchema,
	type SSEStatsEvent,
	SSEStatsEventSchema,
	type StreamAnalyticsOptions,
	type TimePeriod,
	TimePeriodSchema,
	type TimeSeriesData,
	TimeSeriesDataSchema,
	type TimeSeriesPoint,
	TimeSeriesPointSchema,
	type UpdateDestinationRequest,
	UpdateDestinationRequestSchema,
	type UpdateQueueRequest,
	UpdateQueueRequestSchema,
	type UpdateSourceRequest,
	UpdateSourceRequestSchema,
} from './types';

// ============================================================================
// Errors
// ============================================================================

export {
	DestinationAlreadyExistsError,
	DestinationNotFoundError,
	MessageNotFoundError,
	QueueError,
	QueueInvalidArgumentError,
	QueueNotFoundError,
	SourceAlreadyExistsError,
	SourceNotFoundError,
} from './util';

// ============================================================================
// Queue Operations
// ============================================================================

export {
	createQueue,
	DeleteQueueResponseSchema,
	deleteQueue,
	getQueue,
	listQueues,
	pauseQueue,
	QueueResponseSchema,
	QueuesListResponseSchema,
	resumeQueue,
	updateQueue,
} from './queues';

// ============================================================================
// Message Operations
// ============================================================================

export {
	AckNackResponseSchema,
	ackMessage,
	BatchPublishResponseSchema,
	batchPublishMessages,
	consumeMessages,
	DeleteMessageResponseSchema,
	deleteMessage,
	getMessage,
	getMessageByOffset,
	getQueueHead,
	getQueueTail,
	listMessages,
	MessageResponseSchema,
	MessagesListResponseSchema,
	nackMessage,
	OffsetResponseSchema,
	publishMessage,
	ReceiveResponseSchema,
	receiveMessage,
	replayMessage,
} from './messages';

// ============================================================================
// Dead Letter Queue Operations
// ============================================================================

export {
	DeleteDlqResponseSchema,
	DlqListResponseSchema,
	deleteDeadLetterMessage,
	listDeadLetterMessages,
	purgeDeadLetter,
	ReplayDlqResponseSchema,
	replayDeadLetterMessage,
} from './dlq';

// ============================================================================
// Destination Operations
// ============================================================================

export {
	createDestination,
	DeleteDestinationResponseSchema,
	DestinationResponseSchema,
	DestinationsListResponseSchema,
	deleteDestination,
	listDestinations,
	updateDestination,
} from './destinations';

// ============================================================================
// Source Operations
// ============================================================================

export {
	createSource,
	DeleteSourceResponseSchema,
	deleteSource,
	getSource,
	listSources,
	SourceResponseSchema,
	SourcesListResponseSchema,
	updateSource,
} from './sources';

// ============================================================================
// Analytics Operations
// ============================================================================

export {
	getOrgAnalytics,
	getQueueAnalytics,
	getQueueTimeSeries,
	OrgAnalyticsResponseSchema,
	QueueAnalyticsResponseSchema,
	streamOrgAnalytics,
	streamQueueAnalytics,
	TimeSeriesResponseSchema,
} from './analytics';

// ============================================================================
// Validation Utilities
// ============================================================================

export {
	MAX_BATCH_SIZE,
	MAX_DESCRIPTION_LENGTH,
	MAX_IDEMPOTENCY_KEY_LENGTH,
	MAX_IN_FLIGHT,
	MAX_METADATA_SIZE,
	MAX_PARTITION_KEY_LENGTH,
	MAX_PAYLOAD_SIZE,
	MAX_QUEUE_NAME_LENGTH,
	MAX_RETRIES,
	MAX_SOURCE_NAME_LENGTH,
	MAX_VISIBILITY_TIMEOUT,
	MIN_QUEUE_NAME_LENGTH,
	QueueValidationError,
	validateBatchSize,
	validateDescription,
	validateDestinationConfig,
	validateDestinationId,
	validateIdempotencyKey,
	validateLimit,
	validateMaxInFlight,
	validateMaxRetries,
	validateMessageId,
	validateOffset,
	validatePartitionKey,
	validatePayload,
	validateQueueName,
	validateQueueType,
	validateSourceId,
	validateSourceName,
	validateTTL,
	validateVisibilityTimeout,
	validateWebhookUrl,
} from './validation';
