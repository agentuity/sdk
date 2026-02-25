import { z } from 'zod';
import { type APIClient, APIResponseSchema, APIResponseSchemaNoData } from '../api.ts';
import {
	type CreateWebhookDestinationRequest,
	CreateWebhookDestinationRequestSchema,
	type UpdateWebhookDestinationRequest,
	UpdateWebhookDestinationRequestSchema,
	type WebhookApiOptions,
	type WebhookDestination,
	WebhookDestinationSchema,
} from './types.ts';
import {
	buildWebhookHeaders,
	WebhookError,
	webhookApiPath,
	withWebhookErrorHandling,
} from './util.ts';

export const WebhookDestinationResponseSchema = APIResponseSchema(WebhookDestinationSchema);
export const WebhookDestinationsListResponseSchema = APIResponseSchema(
	z.array(WebhookDestinationSchema)
);
export const DeleteWebhookDestinationResponseSchema = APIResponseSchemaNoData();

/**
 * Create a destination for a webhook.
 *
 * Destinations define where incoming webhook payloads are forwarded to.
 * When a webhook receives a payload, it will be delivered to all configured destinations.
 *
 * @param client - The API client instance
 * @param webhookId - The webhook ID (prefixed with wh_)
 * @param params - Destination configuration including type and config
 * @param options - Optional API options (e.g., orgId)
 * @returns The created destination
 * @throws {WebhookNotFoundError} If the webhook does not exist
 * @throws {WebhookError} If the API request fails
 *
 * @example
 * ```typescript
 * const destination = await createWebhookDestination(client, 'wh_abc123', {
 *   type: 'url',
 *   config: { url: 'https://api.example.com/webhook' },
 * });
 * console.log(`Created destination ${destination.id}`);
 * ```
 */
export async function createWebhookDestination(
	client: APIClient,
	webhookId: string,
	params: CreateWebhookDestinationRequest,
	options?: WebhookApiOptions
): Promise<WebhookDestination> {
	const url = webhookApiPath(webhookId, 'destination');
	const resp = await withWebhookErrorHandling(
		() =>
			client.post(
				url,
				params,
				WebhookDestinationResponseSchema,
				CreateWebhookDestinationRequestSchema,
				undefined,
				buildWebhookHeaders(options?.orgId)
			),
		{ webhookId }
	);

	if (resp.success) {
		return resp.data;
	}

	throw new WebhookError({
		webhookId,
		message: resp.message || 'Failed to create webhook destination',
	});
}

/**
 * List all destinations for a webhook.
 *
 * Retrieves all destinations configured for a webhook.
 *
 * @param client - The API client instance
 * @param webhookId - The webhook ID (prefixed with wh_)
 * @param options - Optional API options (e.g., orgId)
 * @returns Array of destinations configured for the webhook
 * @throws {WebhookNotFoundError} If the webhook does not exist
 * @throws {WebhookError} If the API request fails
 *
 * @example
 * ```typescript
 * const destinations = await listWebhookDestinations(client, 'wh_abc123');
 * for (const dest of destinations) {
 *   console.log(`Destination ${dest.id}: type=${dest.type}`);
 * }
 * ```
 */
export async function listWebhookDestinations(
	client: APIClient,
	webhookId: string,
	options?: WebhookApiOptions
): Promise<WebhookDestination[]> {
	const url = webhookApiPath(webhookId, 'destination');
	const resp = await withWebhookErrorHandling(
		() =>
			client.get(
				url,
				WebhookDestinationsListResponseSchema,
				undefined,
				buildWebhookHeaders(options?.orgId)
			),
		{ webhookId }
	);

	if (resp.success) {
		return resp.data;
	}

	throw new WebhookError({
		webhookId,
		message: resp.message || 'Failed to list webhook destinations',
	});
}

/**
 * Update a webhook destination's configuration.
 *
 * Modifies an existing destination's config. Only the fields provided in params will be updated.
 *
 * @param client - The API client instance
 * @param webhookId - The webhook ID (prefixed with wh_)
 * @param destinationId - The destination ID to update (prefixed with whds_)
 * @param params - Fields to update
 * @param options - Optional API options (e.g., orgId)
 * @returns The updated destination
 * @throws {WebhookDestinationNotFoundError} If the destination does not exist
 * @throws {WebhookNotFoundError} If the webhook does not exist
 * @throws {WebhookError} If the API request fails
 *
 * @example
 * ```typescript
 * const updated = await updateWebhookDestination(client, 'wh_abc123', 'whds_def456', {
 *   config: { url: 'https://api.example.com/webhook/v2' },
 * });
 * ```
 */
export async function updateWebhookDestination(
	client: APIClient,
	webhookId: string,
	destinationId: string,
	params: UpdateWebhookDestinationRequest,
	options?: WebhookApiOptions
): Promise<WebhookDestination> {
	const url = webhookApiPath(webhookId, 'destination', destinationId);
	const resp = await withWebhookErrorHandling(
		() =>
			client.put(
				url,
				params,
				WebhookDestinationResponseSchema,
				UpdateWebhookDestinationRequestSchema,
				undefined,
				buildWebhookHeaders(options?.orgId)
			),
		{ webhookId, destinationId }
	);

	if (resp.success) {
		return resp.data;
	}

	throw new WebhookError({
		webhookId,
		message: resp.message || 'Failed to update webhook destination',
	});
}

/**
 * Delete a webhook destination.
 *
 * Permanently removes a destination. Webhook payloads will no longer be
 * forwarded to this endpoint. This action cannot be undone.
 *
 * @param client - The API client instance
 * @param webhookId - The webhook ID (prefixed with wh_)
 * @param destinationId - The destination ID to delete (prefixed with whds_)
 * @param options - Optional API options (e.g., orgId)
 * @throws {WebhookDestinationNotFoundError} If the destination does not exist
 * @throws {WebhookNotFoundError} If the webhook does not exist
 * @throws {WebhookError} If the API request fails
 *
 * @example
 * ```typescript
 * await deleteWebhookDestination(client, 'wh_abc123', 'whds_def456');
 * console.log('Destination deleted');
 * ```
 */
export async function deleteWebhookDestination(
	client: APIClient,
	webhookId: string,
	destinationId: string,
	options?: WebhookApiOptions
): Promise<void> {
	const url = webhookApiPath(webhookId, 'destination', destinationId);
	const resp = await withWebhookErrorHandling(
		() =>
			client.delete(
				url,
				DeleteWebhookDestinationResponseSchema,
				undefined,
				buildWebhookHeaders(options?.orgId)
			),
		{ webhookId, destinationId }
	);

	if (resp.success) {
		return;
	}

	throw new WebhookError({
		webhookId,
		message: resp.message || 'Failed to delete webhook destination',
	});
}
