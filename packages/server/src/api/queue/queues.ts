import { z } from 'zod';
import { type APIClient, APIResponseSchema, APIResponseSchemaNoData } from '../api';
import {
	type CreateQueueRequest,
	CreateQueueRequestSchema,
	type ListQueuesRequest,
	type Queue,
	type QueueApiOptions,
	QueueSchema,
	type UpdateQueueRequest,
	UpdateQueueRequestSchema,
} from './types';
import {
	buildQueueHeaders,
	QueueError,
	QueueNotFoundError,
	queueApiPath,
	queueApiPathWithQuery,
} from './util';
import {
	validateDescription,
	validateLimit,
	validateMaxInFlight,
	validateMaxRetries,
	validateOffset,
	validateQueueName,
	validateQueueType,
	validateTTL,
	validateVisibilityTimeout,
} from './validation';

export const QueueResponseSchema = APIResponseSchema(z.object({ queue: QueueSchema }));
export const QueuesListResponseSchema = APIResponseSchema(
	z.object({
		queues: z.array(QueueSchema),
		total: z.number().optional(),
	})
);
export const DeleteQueueResponseSchema = APIResponseSchemaNoData();

/**
 * Create a new message queue.
 *
 * Creates a queue with the specified type and settings. The queue name is optional
 * and will be auto-generated if not provided.
 *
 * @param client - The API client instance
 * @param params - Queue creation parameters
 * @returns The created queue
 * @throws {QueueValidationError} If validation fails
 * @throws {QueueError} If the API request fails
 *
 * @example
 * ```typescript
 * // Create a worker queue with custom settings
 * const queue = await createQueue(client, {
 *   name: 'order-processing',
 *   queue_type: 'worker',
 *   description: 'Processes customer orders',
 *   settings: {
 *     default_max_retries: 3,
 *     default_visibility_timeout_seconds: 60,
 *   },
 * });
 * console.log(`Created queue: ${queue.id}`);
 * ```
 */
export async function createQueue(
	client: APIClient,
	params: CreateQueueRequest,
	options?: QueueApiOptions
): Promise<Queue> {
	// Validate before sending to API
	validateQueueType(params.queue_type);
	if (params.name) {
		validateQueueName(params.name);
	}
	if (params.description) {
		validateDescription(params.description);
	}
	// Validate settings if provided
	if (params.settings) {
		if (params.settings.default_ttl_seconds !== undefined) {
			validateTTL(params.settings.default_ttl_seconds ?? undefined);
		}
		if (params.settings.default_visibility_timeout_seconds !== undefined) {
			validateVisibilityTimeout(params.settings.default_visibility_timeout_seconds);
		}
		if (params.settings.default_max_retries !== undefined) {
			validateMaxRetries(params.settings.default_max_retries);
		}
		if (params.settings.max_in_flight_per_client !== undefined) {
			validateMaxInFlight(params.settings.max_in_flight_per_client);
		}
	}

	const url = queueApiPath('create');
	const resp = await client.post(
		url,
		params,
		QueueResponseSchema,
		CreateQueueRequestSchema,
		undefined,
		buildQueueHeaders(options?.orgId)
	);

	if (resp.success) {
		return resp.data.queue;
	}

	throw new QueueError({
		message: resp.message || 'Failed to create queue',
	});
}

/**
 * Get a queue by name.
 *
 * Retrieves the queue details including settings and statistics.
 *
 * @param client - The API client instance
 * @param name - The queue name
 * @returns The queue details
 * @throws {QueueValidationError} If the queue name is invalid
 * @throws {QueueNotFoundError} If the queue does not exist
 * @throws {QueueError} If the API request fails
 *
 * @example
 * ```typescript
 * const queue = await getQueue(client, 'order-processing');
 * console.log(`Queue has ${queue.stats?.message_count} messages`);
 * ```
 */
export async function getQueue(
	client: APIClient,
	name: string,
	options?: QueueApiOptions
): Promise<Queue> {
	validateQueueName(name);
	const url = queueApiPath('get', name);
	const resp = await client.get(
		url,
		QueueResponseSchema,
		undefined,
		buildQueueHeaders(options?.orgId)
	);

	if (resp.success) {
		return resp.data.queue;
	}

	if (resp.message?.includes('not found')) {
		throw new QueueNotFoundError({
			queueName: name,
			message: resp.message,
		});
	}

	throw new QueueError({
		queueName: name,
		message: resp.message || 'Failed to get queue',
	});
}

/**
 * List all queues with optional pagination.
 *
 * @param client - The API client instance
 * @param params - Optional pagination parameters
 * @returns Object containing the list of queues and optional total count
 * @throws {QueueValidationError} If pagination parameters are invalid
 * @throws {QueueError} If the API request fails
 *
 * @example
 * ```typescript
 * // List first 10 queues
 * const { queues, total } = await listQueues(client, { limit: 10 });
 * console.log(`Found ${total} queues`);
 *
 * // Paginate through all queues
 * const { queues: page2 } = await listQueues(client, { limit: 10, offset: 10 });
 * ```
 */
export async function listQueues(
	client: APIClient,
	params?: ListQueuesRequest,
	options?: QueueApiOptions
): Promise<{ queues: Queue[]; total?: number }> {
	// Validate pagination params
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
	if (params?.name) {
		searchParams.set('name', params.name);
	}
	if (params?.queue_type) {
		searchParams.set('queue_type', params.queue_type);
	}
	if (params?.status) {
		searchParams.set('status', params.status);
	}
	if (params?.sort) {
		searchParams.set('sort', params.sort);
	}
	if (params?.direction) {
		searchParams.set('direction', params.direction);
	}

	const queryString = searchParams.toString();
	const url = queueApiPathWithQuery('list', queryString || undefined);
	const resp = await client.get(
		url,
		QueuesListResponseSchema,
		undefined,
		buildQueueHeaders(options?.orgId)
	);

	if (resp.success) {
		return { queues: resp.data.queues, total: resp.data.total };
	}

	throw new QueueError({
		message: resp.message || 'Failed to list queues',
	});
}

/**
 * Update an existing queue.
 *
 * Updates the queue description and/or settings. Only provided fields are updated.
 *
 * @param client - The API client instance
 * @param name - The queue name
 * @param params - Update parameters
 * @returns The updated queue
 * @throws {QueueValidationError} If validation fails
 * @throws {QueueNotFoundError} If the queue does not exist
 * @throws {QueueError} If the API request fails
 *
 * @example
 * ```typescript
 * const queue = await updateQueue(client, 'order-processing', {
 *   description: 'Updated description',
 *   settings: { default_max_retries: 5 },
 * });
 * ```
 */
export async function updateQueue(
	client: APIClient,
	name: string,
	params: UpdateQueueRequest,
	options?: QueueApiOptions
): Promise<Queue> {
	// Validate before sending to API
	validateQueueName(name);
	if (params.description) {
		validateDescription(params.description);
	}
	// Validate settings if provided
	if (params.settings) {
		if (params.settings.default_ttl_seconds !== undefined) {
			validateTTL(params.settings.default_ttl_seconds ?? undefined);
		}
		if (params.settings.default_visibility_timeout_seconds !== undefined) {
			validateVisibilityTimeout(params.settings.default_visibility_timeout_seconds);
		}
		if (params.settings.default_max_retries !== undefined) {
			validateMaxRetries(params.settings.default_max_retries);
		}
		if (params.settings.max_in_flight_per_client !== undefined) {
			validateMaxInFlight(params.settings.max_in_flight_per_client);
		}
	}

	const url = queueApiPath('update', name);
	const resp = await client.patch(
		url,
		params,
		QueueResponseSchema,
		UpdateQueueRequestSchema,
		undefined,
		buildQueueHeaders(options?.orgId)
	);

	if (resp.success) {
		return resp.data.queue;
	}

	if (resp.message?.includes('not found')) {
		throw new QueueNotFoundError({
			queueName: name,
			message: resp.message,
		});
	}

	throw new QueueError({
		queueName: name,
		message: resp.message || 'Failed to update queue',
	});
}

/**
 * Delete a queue.
 *
 * Permanently deletes a queue and all its messages. This action cannot be undone.
 *
 * @param client - The API client instance
 * @param name - The queue name
 * @throws {QueueValidationError} If the queue name is invalid
 * @throws {QueueNotFoundError} If the queue does not exist
 * @throws {QueueError} If the API request fails
 *
 * @example
 * ```typescript
 * await deleteQueue(client, 'order-processing');
 * console.log('Queue deleted');
 * ```
 */
export async function deleteQueue(
	client: APIClient,
	name: string,
	options?: QueueApiOptions
): Promise<void> {
	validateQueueName(name);
	const url = queueApiPath('delete', name);
	const resp = await client.delete(
		url,
		DeleteQueueResponseSchema,
		undefined,
		buildQueueHeaders(options?.orgId)
	);

	if (resp.success) {
		return;
	}

	if (resp.message?.includes('not found')) {
		throw new QueueNotFoundError({
			queueName: name,
			message: resp.message,
		});
	}

	throw new QueueError({
		queueName: name,
		message: resp.message || 'Failed to delete queue',
	});
}

/**
 * Pause a queue.
 *
 * Pauses message processing for the queue. Messages can still be published
 * but will not be delivered to consumers until the queue is resumed.
 *
 * @param client - The API client instance
 * @param name - The queue name
 * @returns The updated queue with paused_at timestamp
 * @throws {QueueValidationError} If the queue name is invalid
 * @throws {QueueNotFoundError} If the queue does not exist
 * @throws {QueueError} If the API request fails
 *
 * @example
 * ```typescript
 * const queue = await pauseQueue(client, 'order-processing');
 * console.log(`Queue paused at: ${queue.paused_at}`);
 * ```
 */
export async function pauseQueue(
	client: APIClient,
	name: string,
	options?: QueueApiOptions
): Promise<Queue> {
	validateQueueName(name);
	const url = queueApiPath('pause', name);
	const resp = await client.post(
		url,
		{},
		QueueResponseSchema,
		z.object({}),
		undefined,
		buildQueueHeaders(options?.orgId)
	);

	if (resp.success) {
		return resp.data.queue;
	}

	if (resp.message?.includes('not found')) {
		throw new QueueNotFoundError({
			queueName: name,
			message: resp.message,
		});
	}

	throw new QueueError({
		queueName: name,
		message: resp.message || 'Failed to pause queue',
	});
}

/**
 * Resume a paused queue.
 *
 * Resumes message processing for a paused queue. Consumers will start
 * receiving messages again.
 *
 * @param client - The API client instance
 * @param name - The queue name
 * @returns The updated queue with paused_at cleared
 * @throws {QueueValidationError} If the queue name is invalid
 * @throws {QueueNotFoundError} If the queue does not exist
 * @throws {QueueError} If the API request fails
 *
 * @example
 * ```typescript
 * const queue = await resumeQueue(client, 'order-processing');
 * console.log(`Queue resumed, paused_at: ${queue.paused_at}`); // null
 * ```
 */
export async function resumeQueue(
	client: APIClient,
	name: string,
	options?: QueueApiOptions
): Promise<Queue> {
	validateQueueName(name);
	const url = queueApiPath('resume', name);
	const resp = await client.post(
		url,
		{},
		QueueResponseSchema,
		z.object({}),
		undefined,
		buildQueueHeaders(options?.orgId)
	);

	if (resp.success) {
		return resp.data.queue;
	}

	if (resp.message?.includes('not found')) {
		throw new QueueNotFoundError({
			queueName: name,
			message: resp.message,
		});
	}

	throw new QueueError({
		queueName: name,
		message: resp.message || 'Failed to resume queue',
	});
}
