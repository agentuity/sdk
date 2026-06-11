import { z } from 'zod';
import { type APIClient, APIResponseSchema, APIResponseSchemaNoData } from '../api.ts';
import {
	type CreateDestinationRequest,
	CreateDestinationRequestSchema,
	type DeliveryLog,
	DeliveryLogSchema,
	type Destination,
	DestinationSchema,
	type ListDeliveryLogsRequest,
	type QueueApiOptions,
	type UpdateDestinationRequest,
	UpdateDestinationRequestSchema,
} from './types.ts';
import { buildQueueHeaders, QueueError, queueApiPath, withQueueErrorHandling } from './util.ts';
import { validateDestinationId, validateQueueName } from './validation.ts';

export const DestinationResponseSchema = APIResponseSchema(
	z.object({ destination: DestinationSchema })
);
export const DestinationsListResponseSchema = APIResponseSchema(
	z.object({
		destinations: z.array(DestinationSchema),
	})
);
export const DeleteDestinationResponseSchema = APIResponseSchemaNoData();

/**
 * Create a destination for a queue.
 *
 * Destinations are webhook endpoints that automatically receive messages when
 * they are published to a queue. When a message is published, it will be
 * delivered via HTTP POST to all active destinations configured for that queue.
 *
 * @param client - The API client instance
 * @param queueName - The name of the queue to add the destination to
 * @param params - Destination configuration including URL and optional settings
 * @returns The created destination with assigned ID
 * @throws {QueueValidationError} If validation fails (invalid queue name or config)
 * @throws {QueueNotFoundError} If the queue does not exist
 * @throws {QueueError} If the API request fails
 *
 * @example
 * ```typescript
 * const destination = await createDestination(client, 'order-events', {
 *   url: 'https://api.example.com/webhooks/orders',
 *   config: {
 *     retry_attempts: 3,
 *     timeout_seconds: 30,
 *   },
 * });
 * console.log(`Created destination ${destination.id}`);
 * ```
 */
export async function createDestination(
	client: APIClient,
	queueName: string,
	params: CreateDestinationRequest,
	options?: QueueApiOptions
): Promise<Destination> {
	validateQueueName(queueName);
	const url = queueApiPath('destinations/create', queueName);
	const resp = await withQueueErrorHandling(
		() =>
			client.post(
				url,
				params,
				DestinationResponseSchema,
				CreateDestinationRequestSchema,
				undefined,
				buildQueueHeaders(options?.orgId)
			),
		{ queueName, destinationUrl: params.config?.url as string | undefined }
	);

	if (resp.success) {
		return resp.data.destination;
	}

	throw new QueueError({
		queueName,
		message: resp.message || 'Failed to create destination',
	});
}

/**
 * List all destinations for a queue.
 *
 * Retrieves all webhook destinations configured for a queue. Each destination
 * represents an endpoint that receives messages when they are published.
 *
 * @param client - The API client instance
 * @param queueName - The name of the queue
 * @returns Array of destinations configured for the queue
 * @throws {QueueValidationError} If validation fails (invalid queue name)
 * @throws {QueueNotFoundError} If the queue does not exist
 * @throws {QueueError} If the API request fails
 *
 * @example
 * ```typescript
 * const destinations = await listDestinations(client, 'order-events');
 * for (const dest of destinations) {
 *   console.log(`Destination ${dest.id}: ${dest.url} (${dest.enabled ? 'enabled' : 'disabled'})`);
 * }
 * ```
 */
export async function listDestinations(
	client: APIClient,
	queueName: string,
	options?: QueueApiOptions
): Promise<Destination[]> {
	validateQueueName(queueName);
	const url = queueApiPath('destinations/list', queueName);
	const resp = await withQueueErrorHandling(
		() =>
			client.get(
				url,
				DestinationsListResponseSchema,
				undefined,
				buildQueueHeaders(options?.orgId)
			),
		{ queueName }
	);

	if (resp.success) {
		return resp.data.destinations;
	}

	throw new QueueError({
		queueName,
		message: resp.message || 'Failed to list destinations',
	});
}

/**
 * Update a destination's configuration.
 *
 * Modifies an existing destination's settings such as URL, enabled status,
 * or retry configuration. Only the fields provided in params will be updated.
 *
 * @param client - The API client instance
 * @param queueName - The name of the queue
 * @param destinationId - The destination ID to update (prefixed with qdest_)
 * @param params - Fields to update (partial update supported)
 * @returns The updated destination
 * @throws {QueueValidationError} If validation fails (invalid queue name, destination ID, or config)
 * @throws {DestinationNotFoundError} If the destination does not exist
 * @throws {QueueNotFoundError} If the queue does not exist
 * @throws {QueueError} If the API request fails
 *
 * @example
 * ```typescript
 * // Disable a destination temporarily
 * const updated = await updateDestination(client, 'order-events', 'qdest_abc123', {
 *   enabled: false,
 * });
 *
 * // Update URL and retry settings
 * const updated = await updateDestination(client, 'order-events', 'qdest_abc123', {
 *   url: 'https://api.example.com/v2/webhooks/orders',
 *   config: {
 *     retry_attempts: 5,
 *   },
 * });
 * ```
 */
export async function updateDestination(
	client: APIClient,
	queueName: string,
	destinationId: string,
	params: UpdateDestinationRequest,
	options?: QueueApiOptions
): Promise<Destination> {
	validateQueueName(queueName);
	validateDestinationId(destinationId);
	const url = queueApiPath('destinations/update', queueName, destinationId);
	const resp = await withQueueErrorHandling(
		() =>
			client.patch(
				url,
				params,
				DestinationResponseSchema,
				UpdateDestinationRequestSchema,
				undefined,
				buildQueueHeaders(options?.orgId)
			),
		{ queueName, destinationId }
	);

	if (resp.success) {
		return resp.data.destination;
	}

	throw new QueueError({
		queueName,
		message: resp.message || 'Failed to update destination',
	});
}

/**
 * Delete a destination from a queue.
 *
 * Permanently removes a webhook destination. Messages will no longer be
 * delivered to this endpoint. This action cannot be undone.
 *
 * @param client - The API client instance
 * @param queueName - The name of the queue
 * @param destinationId - The destination ID to delete (prefixed with qdest_)
 * @returns void
 * @throws {QueueValidationError} If validation fails (invalid queue name or destination ID)
 * @throws {DestinationNotFoundError} If the destination does not exist
 * @throws {QueueNotFoundError} If the queue does not exist
 * @throws {QueueError} If the API request fails
 *
 * @example
 * ```typescript
 * await deleteDestination(client, 'order-events', 'qdest_abc123');
 * console.log('Destination deleted');
 * ```
 */
export async function deleteDestination(
	client: APIClient,
	queueName: string,
	destinationId: string,
	options?: QueueApiOptions
): Promise<void> {
	validateQueueName(queueName);
	validateDestinationId(destinationId);

	const url = queueApiPath('destinations/delete', queueName, destinationId);
	const resp = await withQueueErrorHandling(
		() =>
			client.delete(
				url,
				DeleteDestinationResponseSchema,
				undefined,
				buildQueueHeaders(options?.orgId)
			),
		{ queueName, destinationId }
	);

	if (resp.success) {
		return;
	}

	throw new QueueError({
		queueName,
		message: resp.message || 'Failed to delete destination',
	});
}

export const DeliveryLogsListResponseSchema = APIResponseSchema(
	z.object({
		deliveries: z.array(DeliveryLogSchema),
	})
);

/**
 * List delivery attempts for a queue destination.
 *
 * Returns the most recent delivery attempts to a configured webhook destination,
 * including HTTP status codes, timing, and error details for failed deliveries.
 *
 * @param client - The API client instance
 * @param queueName - The name of the queue
 * @param destinationId - The destination ID (prefixed with qdest_)
 * @param params - Optional filtering and pagination
 * @returns Array of delivery log entries
 * @throws {QueueValidationError} If validation fails
 * @throws {DestinationNotFoundError} If the destination does not exist
 * @throws {QueueError} If the API request fails
 *
 * @example
 * ```typescript
 * const deliveries = await listDestinationDeliveries(client, 'order-events', 'qdest_abc123', {
 *   limit: 50,
 *   status: 'failed',
 * });
 * ```
 */
export async function listDestinationDeliveries(
	client: APIClient,
	queueName: string,
	destinationId: string,
	params?: ListDeliveryLogsRequest,
	options?: QueueApiOptions
): Promise<DeliveryLog[]> {
	validateQueueName(queueName);
	validateDestinationId(destinationId);

	const queryParts: string[] = [];
	if (params?.limit !== undefined) queryParts.push(`limit=${params.limit}`);
	if (params?.offset !== undefined) queryParts.push(`offset=${params.offset}`);
	if (params?.status) queryParts.push(`status=${params.status}`);
	const queryString = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';

	const url = queueApiPath('destinations/deliveries', queueName, destinationId) + queryString;
	const resp = await withQueueErrorHandling(
		() =>
			client.get(
				url,
				DeliveryLogsListResponseSchema,
				undefined,
				buildQueueHeaders(options?.orgId)
			),
		{ queueName, destinationId }
	);

	if (resp.success) {
		return resp.data.deliveries;
	}

	throw new QueueError({
		queueName,
		message: resp.message || 'Failed to list destination deliveries',
	});
}
