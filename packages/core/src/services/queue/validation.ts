/**
 * @module validation
 * Queue validation utilities with constants matching the Catalyst backend.
 *
 * These validation functions perform client-side validation before API calls,
 * providing immediate feedback and reducing unnecessary network requests.
 */

// ============================================================================
// Validation Constants
// ============================================================================

/** Maximum allowed length for queue names. */
export const MAX_QUEUE_NAME_LENGTH = 256;

/** Minimum allowed length for queue names. */
export const MIN_QUEUE_NAME_LENGTH = 1;

/** Maximum payload size in bytes (1MB). */
export const MAX_PAYLOAD_SIZE = 1048576;

/** Maximum description length in characters. */
export const MAX_DESCRIPTION_LENGTH = 1024;

/** Maximum number of messages in a single batch operation. */
export const MAX_BATCH_SIZE = 1000;

/** Maximum metadata size in bytes (64KB). */
export const MAX_METADATA_SIZE = 65536;

/** Maximum partition key length in characters. */
export const MAX_PARTITION_KEY_LENGTH = 256;

/** Maximum idempotency key length in characters. */
export const MAX_IDEMPOTENCY_KEY_LENGTH = 256;

/** Maximum visibility timeout in seconds (12 hours). */
export const MAX_VISIBILITY_TIMEOUT = 43200;

/** Maximum number of retry attempts allowed. */
export const MAX_RETRIES = 100;

/** Maximum number of in-flight messages per client. */
export const MAX_IN_FLIGHT = 1000;

/** Queue name pattern: starts with letter/underscore, contains lowercase alphanumerics, underscores, hyphens. */
const VALID_QUEUE_NAME_REGEX = /^[a-z_][a-z0-9_-]*$/;

/** Message ID pattern: must start with qmsg_ prefix. */
const VALID_MESSAGE_ID_REGEX = /^qmsg_[a-zA-Z0-9]+$/;

/** Destination ID pattern: must start with qdest_ prefix. */
const VALID_DESTINATION_ID_REGEX = /^qdest_[a-zA-Z0-9]+$/;

/** Source ID pattern: must start with qsrc_ prefix. */
const VALID_SOURCE_ID_REGEX = /^qsrc_[a-zA-Z0-9]+$/;

/** Maximum source name length. */
export const MAX_SOURCE_NAME_LENGTH = 256;

// ============================================================================
// Validation Error
// ============================================================================

// QueueValidationError is the single definition from service.ts — imported for local use and re-exported
import { QueueValidationError } from './service.ts';
export { QueueValidationError };

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validates a queue name against naming rules.
 *
 * Queue names must:
 * - Be 1-256 characters long
 * - Start with a lowercase letter or underscore
 * - Contain only lowercase letters, digits, underscores, and hyphens
 *
 * @param name - The queue name to validate
 * @throws {QueueValidationError} If the name is invalid
 *
 * @example
 * ```typescript
 * validateQueueName('my_queue');      // OK
 * validateQueueName('order-queue');   // OK
 * validateQueueName('Invalid Name!'); // Throws
 * ```
 */
export function validateQueueName(name: string): void {
	if (!name || name.length < MIN_QUEUE_NAME_LENGTH) {
		throw new QueueValidationError({
			message: 'Queue name cannot be empty',
			field: 'name',
			value: name,
		});
	}
	if (name.length > MAX_QUEUE_NAME_LENGTH) {
		throw new QueueValidationError({
			message: `Queue name must not exceed ${MAX_QUEUE_NAME_LENGTH} characters`,
			field: 'name',
			value: name,
		});
	}
	if (!VALID_QUEUE_NAME_REGEX.test(name)) {
		throw new QueueValidationError({
			message:
				'Queue name must start with a letter or underscore and contain only lowercase letters, digits, underscores, and hyphens',
			field: 'name',
			value: name,
		});
	}
}

/**
 * Validates a queue type.
 *
 * @param type - The queue type to validate
 * @throws {QueueValidationError} If the type is not 'worker' or 'pubsub'
 */
export function validateQueueType(type: string): void {
	if (type !== 'worker' && type !== 'pubsub') {
		throw new QueueValidationError({
			message: "Queue type must be 'worker' or 'pubsub'",
			field: 'queue_type',
			value: type,
		});
	}
}

/**
 * Validates a message payload.
 *
 * Payloads must be non-empty JSON and not exceed 1MB when serialized.
 *
 * @param payload - The payload to validate (must be JSON-serializable)
 * @throws {QueueValidationError} If the payload is empty or too large
 */
export function validatePayload(payload: unknown): void {
	if (payload === undefined || payload === null) {
		throw new QueueValidationError({
			message: 'Payload cannot be empty',
			field: 'payload',
		});
	}
	const serialized = JSON.stringify(payload);
	const payloadBytes = new TextEncoder().encode(serialized).length;
	if (payloadBytes > MAX_PAYLOAD_SIZE) {
		throw new QueueValidationError({
			message: `Payload size exceeds ${MAX_PAYLOAD_SIZE} byte limit (${payloadBytes} bytes)`,
			field: 'payload',
			value: payloadBytes,
		});
	}
}

/**
 * Validates a message ID format.
 *
 * Message IDs must start with the `qmsg_` prefix.
 *
 * @param id - The message ID to validate
 * @throws {QueueValidationError} If the ID format is invalid
 */
export function validateMessageId(id: string): void {
	if (!id || !VALID_MESSAGE_ID_REGEX.test(id)) {
		throw new QueueValidationError({
			message: 'Invalid message ID format (must start with qmsg_ prefix)',
			field: 'message_id',
			value: id,
		});
	}
}

/**
 * Validates a destination ID format.
 *
 * Destination IDs must start with the `qdest_` prefix.
 *
 * @param id - The destination ID to validate
 * @throws {QueueValidationError} If the ID format is invalid
 */
export function validateDestinationId(id: string): void {
	if (!id || !VALID_DESTINATION_ID_REGEX.test(id)) {
		throw new QueueValidationError({
			message: 'Invalid destination ID format (must start with qdest_ prefix)',
			field: 'destination_id',
			value: id,
		});
	}
}

/**
 * Validates a queue or message description.
 *
 * @param description - The description to validate (optional)
 * @throws {QueueValidationError} If the description exceeds the maximum length
 */
export function validateDescription(description?: string): void {
	if (description && description.length > MAX_DESCRIPTION_LENGTH) {
		throw new QueueValidationError({
			message: `Description must not exceed ${MAX_DESCRIPTION_LENGTH} characters`,
			field: 'description',
			value: description.length,
		});
	}
}

/**
 * Validates a partition key length.
 *
 * Partition keys are used for message ordering within a queue.
 *
 * @param key - The partition key to validate (optional)
 * @throws {QueueValidationError} If the key exceeds the maximum length
 */
export function validatePartitionKey(key?: string): void {
	if (key && key.length > MAX_PARTITION_KEY_LENGTH) {
		throw new QueueValidationError({
			message: `Partition key must not exceed ${MAX_PARTITION_KEY_LENGTH} characters`,
			field: 'partition_key',
			value: key.length,
		});
	}
}

/**
 * Validates an idempotency key length.
 *
 * Idempotency keys are used to prevent duplicate message processing.
 *
 * @param key - The idempotency key to validate (optional)
 * @throws {QueueValidationError} If the key exceeds the maximum length
 */
export function validateIdempotencyKey(key?: string): void {
	if (key && key.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
		throw new QueueValidationError({
			message: `Idempotency key must not exceed ${MAX_IDEMPOTENCY_KEY_LENGTH} characters`,
			field: 'idempotency_key',
			value: key.length,
		});
	}
}

/**
 * Validates a time-to-live value.
 *
 * TTL specifies how long a message should be kept before expiring.
 *
 * @param ttl - The TTL in seconds to validate (optional)
 * @throws {QueueValidationError} If the TTL is negative
 */
export function validateTTL(ttl?: number): void {
	if (ttl !== undefined && ttl < 0) {
		throw new QueueValidationError({
			message: 'TTL cannot be negative',
			field: 'ttl',
			value: ttl,
		});
	}
}

/**
 * Validates a visibility timeout.
 *
 * Visibility timeout is how long a message is hidden after being received,
 * giving the consumer time to process it before it becomes visible again.
 *
 * @param timeout - The timeout in seconds to validate (optional)
 * @throws {QueueValidationError} If the timeout is out of valid range (1-43200 seconds)
 */
export function validateVisibilityTimeout(timeout?: number): void {
	if (timeout !== undefined) {
		if (timeout < 1) {
			throw new QueueValidationError({
				message: 'Visibility timeout must be at least 1 second',
				field: 'visibility_timeout',
				value: timeout,
			});
		}
		if (timeout > MAX_VISIBILITY_TIMEOUT) {
			throw new QueueValidationError({
				message: `Visibility timeout must not exceed ${MAX_VISIBILITY_TIMEOUT} seconds (12 hours)`,
				field: 'visibility_timeout',
				value: timeout,
			});
		}
	}
}

/**
 * Validates the maximum retry count.
 *
 * @param retries - The max retries value to validate (optional)
 * @throws {QueueValidationError} If retries is negative or exceeds maximum
 */
export function validateMaxRetries(retries?: number): void {
	if (retries !== undefined) {
		if (retries < 0) {
			throw new QueueValidationError({
				message: 'Max retries cannot be negative',
				field: 'max_retries',
				value: retries,
			});
		}
		if (retries > MAX_RETRIES) {
			throw new QueueValidationError({
				message: `Max retries must not exceed ${MAX_RETRIES}`,
				field: 'max_retries',
				value: retries,
			});
		}
	}
}

/**
 * Validates the maximum in-flight messages per client.
 *
 * This controls how many messages a single consumer can process concurrently.
 *
 * @param maxInFlight - The max in-flight value to validate (optional)
 * @throws {QueueValidationError} If the value is out of valid range (1-1000)
 */
export function validateMaxInFlight(maxInFlight?: number): void {
	if (maxInFlight !== undefined) {
		if (maxInFlight < 1) {
			throw new QueueValidationError({
				message: 'Max in-flight per client must be at least 1',
				field: 'max_in_flight',
				value: maxInFlight,
			});
		}
		if (maxInFlight > MAX_IN_FLIGHT) {
			throw new QueueValidationError({
				message: `Max in-flight per client must not exceed ${MAX_IN_FLIGHT}`,
				field: 'max_in_flight',
				value: maxInFlight,
			});
		}
	}
}

/**
 * Validates a message offset.
 *
 * Offsets are sequential positions in the queue, starting from 0.
 *
 * @param offset - The offset value to validate
 * @throws {QueueValidationError} If the offset is negative
 */
export function validateOffset(offset: number): void {
	if (offset < 0) {
		throw new QueueValidationError({
			message: 'Offset cannot be negative',
			field: 'offset',
			value: offset,
		});
	}
}

/**
 * Validates a limit for list/consume operations.
 *
 * @param limit - The limit value to validate
 * @throws {QueueValidationError} If the limit is less than 1 or exceeds maximum
 */
export function validateLimit(limit: number): void {
	if (limit < 1) {
		throw new QueueValidationError({
			message: 'Limit must be at least 1',
			field: 'limit',
			value: limit,
		});
	}
	if (limit > MAX_BATCH_SIZE) {
		throw new QueueValidationError({
			message: `Limit must not exceed ${MAX_BATCH_SIZE}`,
			field: 'limit',
			value: limit,
		});
	}
}

/**
 * Validates a batch size for batch operations.
 *
 * @param size - The batch size to validate
 * @throws {QueueValidationError} If the size is less than 1 or exceeds maximum
 */
export function validateBatchSize(size: number): void {
	if (size <= 0) {
		throw new QueueValidationError({
			message: 'Batch size must be greater than 0',
			field: 'batch_size',
			value: size,
		});
	}
	if (size > MAX_BATCH_SIZE) {
		throw new QueueValidationError({
			message: `Batch size must not exceed ${MAX_BATCH_SIZE}`,
			field: 'batch_size',
			value: size,
		});
	}
}

/**
 * Validates a webhook URL for destinations.
 *
 * URLs must use HTTP or HTTPS protocol.
 *
 * @param url - The URL to validate
 * @throws {QueueValidationError} If the URL is missing or not HTTP/HTTPS
 */
export function validateWebhookUrl(url: string): void {
	if (!url) {
		throw new QueueValidationError({
			message: 'Webhook URL is required',
			field: 'url',
		});
	}
	if (!url.startsWith('http://') && !url.startsWith('https://')) {
		throw new QueueValidationError({
			message: 'Webhook URL must be a valid HTTP or HTTPS URL',
			field: 'url',
			value: url,
		});
	}
}

/**
 * Validates a destination configuration object.
 *
 * Checks that the config contains a valid URL and optional method/timeout settings.
 *
 * @param config - The destination config object to validate
 * @throws {QueueValidationError} If the config is invalid
 */
export function validateDestinationConfig(config: Record<string, unknown>): void {
	if (!config) {
		throw new QueueValidationError({
			message: 'Destination config is required',
			field: 'config',
		});
	}

	const url = config.url;
	if (typeof url !== 'string' || !url) {
		throw new QueueValidationError({
			message: 'config.url is required',
			field: 'config.url',
		});
	}
	validateWebhookUrl(url);

	const method = config.method;
	if (method !== undefined) {
		if (method !== 'POST' && method !== 'PUT' && method !== 'PATCH') {
			throw new QueueValidationError({
				message: 'config.method must be POST, PUT, or PATCH',
				field: 'config.method',
				value: method,
			});
		}
	}

	const timeoutMs = config.timeout_ms;
	if (timeoutMs !== undefined) {
		if (typeof timeoutMs !== 'number' || timeoutMs < 1000 || timeoutMs > 300000) {
			throw new QueueValidationError({
				message: 'config.timeout_ms must be between 1000 and 300000',
				field: 'config.timeout_ms',
				value: timeoutMs,
			});
		}
	}
}

/**
 * Validates a source ID format.
 *
 * Source IDs must start with the `qsrc_` prefix.
 *
 * @param id - The source ID to validate
 * @throws {QueueValidationError} If the ID format is invalid
 *
 * @example
 * ```typescript
 * validateSourceId('qsrc_abc123'); // OK
 * validateSourceId('invalid');     // Throws
 * ```
 */
export function validateSourceId(id: string): void {
	if (!id || typeof id !== 'string') {
		throw new QueueValidationError({
			field: 'source_id',
			value: id,
			message: 'Source ID is required',
		});
	}
	if (!VALID_SOURCE_ID_REGEX.test(id)) {
		throw new QueueValidationError({
			field: 'source_id',
			value: id,
			message:
				'Source ID must start with "qsrc_" prefix and contain only alphanumeric characters',
		});
	}
}

/**
 * Validates a source name.
 *
 * Source names must be non-empty and not exceed the maximum length.
 *
 * @param name - The source name to validate
 * @throws {QueueValidationError} If the name is invalid
 *
 * @example
 * ```typescript
 * validateSourceName('my-source');   // OK
 * validateSourceName('');          // Throws
 * ```
 */
export function validateSourceName(name: string): void {
	if (!name || typeof name !== 'string') {
		throw new QueueValidationError({
			field: 'source_name',
			value: name,
			message: 'Source name is required',
		});
	}
	if (name.length > MAX_SOURCE_NAME_LENGTH) {
		throw new QueueValidationError({
			field: 'source_name',
			value: name,
			message: `Source name must be at most ${MAX_SOURCE_NAME_LENGTH} characters`,
		});
	}
}
