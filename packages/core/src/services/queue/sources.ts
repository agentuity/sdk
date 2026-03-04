import { z } from 'zod';
import { type APIClient, APIResponseSchema, APIResponseSchemaNoData } from '../api.ts';
import {
	type CreateSourceRequest,
	CreateSourceRequestSchema,
	type ListSourceEventsRequest,
	type QueueApiOptions,
	type Source,
	type SourceEvent,
	SourceEventSchema,
	SourceSchema,
	type UpdateSourceRequest,
	UpdateSourceRequestSchema,
} from './types.ts';
import { buildQueueHeaders, QueueError, queueApiPath, withQueueErrorHandling } from './util.ts';
import { validateQueueName, validateSourceId, validateSourceName } from './validation.ts';

export const SourceResponseSchema = APIResponseSchema(z.object({ source: SourceSchema }));
export const SourcesListResponseSchema = APIResponseSchema(
	z.object({
		sources: z.array(SourceSchema),
	})
);
export const DeleteSourceResponseSchema = APIResponseSchemaNoData();

/**
 * Create a source for a queue.
 *
 * Sources are public HTTP ingestion endpoints that allow external systems to
 * publish messages to a queue. They support various authentication methods
 * to secure access.
 *
 * @param client - The API client instance
 * @param queueName - The name of the queue to add the source to
 * @param params - Source configuration including name and optional auth settings
 * @returns The created source with assigned ID and public URL
 * @throws {QueueValidationError} If validation fails (invalid queue name or source name)
 * @throws {QueueNotFoundError} If the queue does not exist
 * @throws {SourceAlreadyExistsError} If a source with the same name already exists
 * @throws {QueueError} If the API request fails
 *
 * @example
 * ```typescript
 * const source = await createSource(client, 'order-events', {
 *   name: 'webhook-ingestion',
 *   description: 'Receives webhooks from external service',
 *   auth_type: 'header',
 *   auth_value: 'Bearer my-secret-token',
 * });
 * console.log(`Created source ${source.id} at ${source.url}`);
 * ```
 */
export async function createSource(
	client: APIClient,
	queueName: string,
	params: CreateSourceRequest,
	options?: QueueApiOptions
): Promise<Source> {
	validateQueueName(queueName);
	validateSourceName(params.name);

	const url = queueApiPath('sources/create', queueName);
	const resp = await withQueueErrorHandling(
		() =>
			client.post(
				url,
				params,
				SourceResponseSchema,
				CreateSourceRequestSchema,
				undefined,
				buildQueueHeaders(options?.orgId)
			),
		{ queueName, sourceName: params.name }
	);

	if (resp.success) {
		return resp.data.source;
	}

	throw new QueueError({
		queueName,
		message: resp.message || 'Failed to create source',
	});
}

/**
 * List all sources for a queue.
 *
 * Retrieves all HTTP ingestion endpoints configured for a queue. Each source
 * provides a public URL for external systems to publish messages.
 *
 * @param client - The API client instance
 * @param queueName - The name of the queue
 * @returns Array of sources configured for the queue
 * @throws {QueueValidationError} If validation fails (invalid queue name)
 * @throws {QueueNotFoundError} If the queue does not exist
 * @throws {QueueError} If the API request fails
 *
 * @example
 * ```typescript
 * const sources = await listSources(client, 'order-events');
 * for (const source of sources) {
 *   console.log(`Source ${source.id}: ${source.name} (${source.enabled ? 'enabled' : 'disabled'})`);
 *   console.log(`  URL: ${source.url}`);
 *   console.log(`  Success rate: ${source.success_count}/${source.request_count}`);
 * }
 * ```
 */
export async function listSources(
	client: APIClient,
	queueName: string,
	options?: QueueApiOptions
): Promise<Source[]> {
	validateQueueName(queueName);
	const url = queueApiPath('sources/list', queueName);
	const resp = await withQueueErrorHandling(
		() =>
			client.get(url, SourcesListResponseSchema, undefined, buildQueueHeaders(options?.orgId)),
		{ queueName }
	);

	if (resp.success) {
		return resp.data.sources;
	}

	throw new QueueError({
		queueName,
		message: resp.message || 'Failed to list sources',
	});
}

/**
 * Get a source by ID.
 *
 * Retrieves a specific source's details including its public URL and statistics.
 *
 * @param client - The API client instance
 * @param queueName - The name of the queue
 * @param sourceId - The source ID to retrieve (prefixed with qsrc_)
 * @returns The source details
 * @throws {QueueValidationError} If validation fails (invalid queue name or source ID)
 * @throws {SourceNotFoundError} If the source does not exist
 * @throws {QueueNotFoundError} If the queue does not exist
 * @throws {QueueError} If the API request fails
 *
 * @example
 * ```typescript
 * const source = await getSource(client, 'order-events', 'qsrc_abc123');
 * console.log(`Source: ${source.name}`);
 * console.log(`URL: ${source.url}`);
 * console.log(`Auth type: ${source.auth_type}`);
 * console.log(`Last request: ${source.last_request_at}`);
 * ```
 */
export async function getSource(
	client: APIClient,
	queueName: string,
	sourceId: string,
	options?: QueueApiOptions
): Promise<Source> {
	validateQueueName(queueName);
	validateSourceId(sourceId);

	const url = queueApiPath('sources/get', queueName, sourceId);
	const resp = await withQueueErrorHandling(
		() => client.get(url, SourceResponseSchema, undefined, buildQueueHeaders(options?.orgId)),
		{ queueName, sourceId }
	);

	if (resp.success) {
		return resp.data.source;
	}

	throw new QueueError({
		queueName,
		message: resp.message || 'Failed to get source',
	});
}

/**
 * Update a source's configuration.
 *
 * Modifies an existing source's settings such as name, enabled status,
 * or authentication configuration. Only the fields provided in params will be updated.
 *
 * @param client - The API client instance
 * @param queueName - The name of the queue
 * @param sourceId - The source ID to update (prefixed with qsrc_)
 * @param params - Fields to update (partial update supported)
 * @returns The updated source
 * @throws {QueueValidationError} If validation fails (invalid queue name or source ID)
 * @throws {SourceNotFoundError} If the source does not exist
 * @throws {QueueNotFoundError} If the queue does not exist
 * @throws {QueueError} If the API request fails
 *
 * @example
 * ```typescript
 * // Disable a source temporarily
 * const updated = await updateSource(client, 'order-events', 'qsrc_abc123', {
 *   enabled: false,
 * });
 *
 * // Update authentication
 * const updated = await updateSource(client, 'order-events', 'qsrc_abc123', {
 *   auth_type: 'basic',
 *   auth_value: 'user:password',
 * });
 * ```
 */
export async function updateSource(
	client: APIClient,
	queueName: string,
	sourceId: string,
	params: UpdateSourceRequest,
	options?: QueueApiOptions
): Promise<Source> {
	validateQueueName(queueName);
	validateSourceId(sourceId);
	if (params.name) {
		validateSourceName(params.name);
	}

	const url = queueApiPath('sources/update', queueName, sourceId);
	const resp = await withQueueErrorHandling(
		() =>
			client.patch(
				url,
				params,
				SourceResponseSchema,
				UpdateSourceRequestSchema,
				undefined,
				buildQueueHeaders(options?.orgId)
			),
		{ queueName, sourceId }
	);

	if (resp.success) {
		return resp.data.source;
	}

	throw new QueueError({
		queueName,
		message: resp.message || 'Failed to update source',
	});
}

/**
 * Delete a source from a queue.
 *
 * Permanently removes an HTTP ingestion endpoint. The public URL will no longer
 * accept requests. This action cannot be undone.
 *
 * @param client - The API client instance
 * @param queueName - The name of the queue
 * @param sourceId - The source ID to delete (prefixed with qsrc_)
 * @returns void
 * @throws {QueueValidationError} If validation fails (invalid queue name or source ID)
 * @throws {SourceNotFoundError} If the source does not exist
 * @throws {QueueNotFoundError} If the queue does not exist
 * @throws {QueueError} If the API request fails
 *
 * @example
 * ```typescript
 * await deleteSource(client, 'order-events', 'qsrc_abc123');
 * console.log('Source deleted');
 * ```
 */
export async function deleteSource(
	client: APIClient,
	queueName: string,
	sourceId: string,
	options?: QueueApiOptions
): Promise<void> {
	validateQueueName(queueName);
	validateSourceId(sourceId);

	const url = queueApiPath('sources/delete', queueName, sourceId);
	const resp = await withQueueErrorHandling(
		() =>
			client.delete(
				url,
				DeleteSourceResponseSchema,
				undefined,
				buildQueueHeaders(options?.orgId)
			),
		{ queueName, sourceId }
	);

	if (resp.success) {
		return;
	}

	throw new QueueError({
		queueName,
		message: resp.message || 'Failed to delete source',
	});
}

export const SourceEventsListResponseSchema = APIResponseSchema(
	z.object({
		events: z.array(SourceEventSchema),
	})
);

/**
 * List events received through a queue source.
 *
 * Returns the most recent events (requests) received through a source's
 * public endpoint, including both successful and failed ingestion attempts.
 *
 * @param client - The API client instance
 * @param queueName - The name of the queue
 * @param sourceId - The source ID (prefixed with qsrc_)
 * @param params - Optional filtering and pagination
 * @returns Array of source events
 * @throws {QueueValidationError} If validation fails
 * @throws {SourceNotFoundError} If the source does not exist
 * @throws {QueueError} If the API request fails
 *
 * @example
 * ```typescript
 * const events = await listSourceEvents(client, 'order-events', 'qsrc_abc123', {
 *   limit: 50,
 *   status: 'failed',
 * });
 * ```
 */
export async function listSourceEvents(
	client: APIClient,
	queueName: string,
	sourceId: string,
	params?: ListSourceEventsRequest,
	options?: QueueApiOptions
): Promise<SourceEvent[]> {
	validateQueueName(queueName);
	validateSourceId(sourceId);

	const queryParts: string[] = [];
	if (params?.limit) queryParts.push(`limit=${params.limit}`);
	if (params?.offset) queryParts.push(`offset=${params.offset}`);
	if (params?.status) queryParts.push(`status=${params.status}`);
	const queryString = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';

	const url = queueApiPath('sources/events', queueName, sourceId) + queryString;
	const resp = await withQueueErrorHandling(
		() =>
			client.get(
				url,
				SourceEventsListResponseSchema,
				undefined,
				buildQueueHeaders(options?.orgId)
			),
		{ queueName, sourceId }
	);

	if (resp.success) {
		return resp.data.events;
	}

	throw new QueueError({
		queueName,
		message: resp.message || 'Failed to list source events',
	});
}
