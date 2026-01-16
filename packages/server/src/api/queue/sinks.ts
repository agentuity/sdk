import { z } from 'zod';
import { APIClient, APIResponseSchema, APIResponseSchemaNoData, APIError } from '../api';
import {
	SinkSchema,
	type Sink,
	type CreateSinkRequest,
	type UpdateSinkRequest,
	type QueueApiOptions,
	CreateSinkRequestSchema,
	UpdateSinkRequestSchema,
} from './types';
import {
	QueueError,
	QueueNotFoundError,
	SinkNotFoundError,
	SinkAlreadyExistsError,
	queueApiPath,
	buildQueueHeaders,
} from './util';
import { validateQueueName, validateSinkId, validateSinkName } from './validation';

const SinkResponseSchema = APIResponseSchema(z.object({ sink: SinkSchema }));
const SinksListResponseSchema = APIResponseSchema(
	z.object({
		sinks: z.array(SinkSchema),
	})
);
const DeleteSinkResponseSchema = APIResponseSchemaNoData();

/**
 * Create a sink for a queue.
 *
 * Sinks are public HTTP ingestion endpoints that allow external systems to
 * publish messages to a queue. They support various authentication methods
 * to secure access.
 *
 * @param client - The API client instance
 * @param queueName - The name of the queue to add the sink to
 * @param params - Sink configuration including name and optional auth settings
 * @returns The created sink with assigned ID and public URL
 * @throws {QueueValidationError} If validation fails (invalid queue name or sink name)
 * @throws {QueueNotFoundError} If the queue does not exist
 * @throws {SinkAlreadyExistsError} If a sink with the same name already exists
 * @throws {QueueError} If the API request fails
 *
 * @example
 * ```typescript
 * const sink = await createSink(client, 'order-events', {
 *   name: 'webhook-ingestion',
 *   description: 'Receives webhooks from external service',
 *   auth_type: 'header',
 *   auth_value: 'Bearer my-secret-token',
 * });
 * console.log(`Created sink ${sink.id} at ${sink.url}`);
 * ```
 */
export async function createSink(
	client: APIClient,
	queueName: string,
	params: CreateSinkRequest,
	options?: QueueApiOptions
): Promise<Sink> {
	validateQueueName(queueName);
	validateSinkName(params.name);

	const url = queueApiPath('sinks/create', queueName);

	try {
		const resp = await client.post(
			url,
			params,
			SinkResponseSchema,
			CreateSinkRequestSchema,
			undefined,
			buildQueueHeaders(options?.orgId)
		);

		if (resp.success) {
			return resp.data.sink;
		}

		if (resp.message?.includes('queue') && resp.message?.includes('not found')) {
			throw new QueueNotFoundError({
				queueName,
				message: resp.message,
			});
		}

		if (resp.message?.includes('already exists')) {
			throw new SinkAlreadyExistsError({
				queueName,
				name: params.name,
				message: `A sink with name "${params.name}" already exists for queue "${queueName}"`,
			});
		}

		throw new QueueError({
			queueName,
			message: resp.message || 'Failed to create sink',
		});
	} catch (error) {
		if (error instanceof APIError) {
			const message = error.message || '';
			if (message.includes('already exists')) {
				throw new SinkAlreadyExistsError({
					queueName,
					name: params.name,
					message: `A sink with name "${params.name}" already exists for queue "${queueName}"`,
				});
			}
			if (message.includes('queue') && message.includes('not found')) {
				throw new QueueNotFoundError({
					queueName,
					message,
				});
			}
			throw new QueueError({
				queueName,
				message: message || 'Failed to create sink',
			});
		}
		throw error;
	}
}

/**
 * List all sinks for a queue.
 *
 * Retrieves all HTTP ingestion endpoints configured for a queue. Each sink
 * provides a public URL for external systems to publish messages.
 *
 * @param client - The API client instance
 * @param queueName - The name of the queue
 * @returns Array of sinks configured for the queue
 * @throws {QueueValidationError} If validation fails (invalid queue name)
 * @throws {QueueNotFoundError} If the queue does not exist
 * @throws {QueueError} If the API request fails
 *
 * @example
 * ```typescript
 * const sinks = await listSinks(client, 'order-events');
 * for (const sink of sinks) {
 *   console.log(`Sink ${sink.id}: ${sink.name} (${sink.enabled ? 'enabled' : 'disabled'})`);
 *   console.log(`  URL: ${sink.url}`);
 *   console.log(`  Success rate: ${sink.success_count}/${sink.request_count}`);
 * }
 * ```
 */
export async function listSinks(
	client: APIClient,
	queueName: string,
	options?: QueueApiOptions
): Promise<Sink[]> {
	validateQueueName(queueName);
	const url = queueApiPath('sinks/list', queueName);
	const resp = await client.get(
		url,
		SinksListResponseSchema,
		undefined,
		buildQueueHeaders(options?.orgId)
	);

	if (resp.success) {
		return resp.data.sinks;
	}

	if (resp.message?.includes('not found')) {
		throw new QueueNotFoundError({
			queueName,
			message: resp.message,
		});
	}

	throw new QueueError({
		queueName,
		message: resp.message || 'Failed to list sinks',
	});
}

/**
 * Get a sink by ID.
 *
 * Retrieves a specific sink's details including its public URL and statistics.
 *
 * @param client - The API client instance
 * @param queueName - The name of the queue
 * @param sinkId - The sink ID to retrieve (prefixed with qsnk_)
 * @returns The sink details
 * @throws {QueueValidationError} If validation fails (invalid queue name or sink ID)
 * @throws {SinkNotFoundError} If the sink does not exist
 * @throws {QueueNotFoundError} If the queue does not exist
 * @throws {QueueError} If the API request fails
 *
 * @example
 * ```typescript
 * const sink = await getSink(client, 'order-events', 'qsnk_abc123');
 * console.log(`Sink: ${sink.name}`);
 * console.log(`URL: ${sink.url}`);
 * console.log(`Auth type: ${sink.auth_type}`);
 * console.log(`Last request: ${sink.last_request_at}`);
 * ```
 */
export async function getSink(
	client: APIClient,
	queueName: string,
	sinkId: string,
	options?: QueueApiOptions
): Promise<Sink> {
	validateQueueName(queueName);
	validateSinkId(sinkId);

	const url = queueApiPath('sinks/get', queueName, sinkId);
	const resp = await client.get(
		url,
		SinkResponseSchema,
		undefined,
		buildQueueHeaders(options?.orgId)
	);

	if (resp.success) {
		return resp.data.sink;
	}

	if (resp.message?.includes('sink') && resp.message?.includes('not found')) {
		throw new SinkNotFoundError({
			queueName,
			sinkId,
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
		message: resp.message || 'Failed to get sink',
	});
}

/**
 * Update a sink's configuration.
 *
 * Modifies an existing sink's settings such as name, enabled status,
 * or authentication configuration. Only the fields provided in params will be updated.
 *
 * @param client - The API client instance
 * @param queueName - The name of the queue
 * @param sinkId - The sink ID to update (prefixed with qsnk_)
 * @param params - Fields to update (partial update supported)
 * @returns The updated sink
 * @throws {QueueValidationError} If validation fails (invalid queue name or sink ID)
 * @throws {SinkNotFoundError} If the sink does not exist
 * @throws {QueueNotFoundError} If the queue does not exist
 * @throws {QueueError} If the API request fails
 *
 * @example
 * ```typescript
 * // Disable a sink temporarily
 * const updated = await updateSink(client, 'order-events', 'qsnk_abc123', {
 *   enabled: false,
 * });
 *
 * // Update authentication
 * const updated = await updateSink(client, 'order-events', 'qsnk_abc123', {
 *   auth_type: 'basic',
 *   auth_value: 'user:password',
 * });
 * ```
 */
export async function updateSink(
	client: APIClient,
	queueName: string,
	sinkId: string,
	params: UpdateSinkRequest,
	options?: QueueApiOptions
): Promise<Sink> {
	validateQueueName(queueName);
	validateSinkId(sinkId);
	if (params.name) {
		validateSinkName(params.name);
	}

	const url = queueApiPath('sinks/update', queueName, sinkId);
	const resp = await client.patch(
		url,
		params,
		SinkResponseSchema,
		UpdateSinkRequestSchema,
		undefined,
		buildQueueHeaders(options?.orgId)
	);

	if (resp.success) {
		return resp.data.sink;
	}

	if (resp.message?.includes('sink') && resp.message?.includes('not found')) {
		throw new SinkNotFoundError({
			queueName,
			sinkId,
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
		message: resp.message || 'Failed to update sink',
	});
}

/**
 * Delete a sink from a queue.
 *
 * Permanently removes an HTTP ingestion endpoint. The public URL will no longer
 * accept requests. This action cannot be undone.
 *
 * @param client - The API client instance
 * @param queueName - The name of the queue
 * @param sinkId - The sink ID to delete (prefixed with qsnk_)
 * @returns void
 * @throws {QueueValidationError} If validation fails (invalid queue name or sink ID)
 * @throws {SinkNotFoundError} If the sink does not exist
 * @throws {QueueNotFoundError} If the queue does not exist
 * @throws {QueueError} If the API request fails
 *
 * @example
 * ```typescript
 * await deleteSink(client, 'order-events', 'qsnk_abc123');
 * console.log('Sink deleted');
 * ```
 */
export async function deleteSink(
	client: APIClient,
	queueName: string,
	sinkId: string,
	options?: QueueApiOptions
): Promise<void> {
	validateQueueName(queueName);
	validateSinkId(sinkId);

	const url = queueApiPath('sinks/delete', queueName, sinkId);
	const resp = await client.delete(
		url,
		DeleteSinkResponseSchema,
		undefined,
		buildQueueHeaders(options?.orgId)
	);

	if (resp.success) {
		return;
	}

	if (resp.message?.includes('sink') && resp.message?.includes('not found')) {
		throw new SinkNotFoundError({
			queueName,
			sinkId,
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
		message: resp.message || 'Failed to delete sink',
	});
}
