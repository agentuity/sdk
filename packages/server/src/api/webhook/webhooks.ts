import { z } from 'zod';
import { type APIClient, APIResponseSchema, APIResponseSchemaNoData } from '../api.ts';
import {
	type CreateWebhookRequest,
	CreateWebhookRequestSchema,
	type ListWebhooksRequest,
	type UpdateWebhookRequest,
	UpdateWebhookRequestSchema,
	type Webhook,
	type WebhookApiOptions,
	WebhookSchema,
} from './types.ts';
import {
	buildWebhookHeaders,
	WebhookError,
	webhookApiPath,
	webhookApiPathWithQuery,
	withWebhookErrorHandling,
} from './util.ts';

export const WebhookResponseSchema = APIResponseSchema(WebhookSchema);
export const WebhooksListResponseSchema = APIResponseSchema(z.array(WebhookSchema));
export const DeleteWebhookResponseSchema = APIResponseSchemaNoData();

/**
 * Create a new webhook.
 *
 * Creates a webhook with the specified name and optional description.
 *
 * @param client - The API client instance
 * @param params - Webhook creation parameters
 * @param options - Optional API options (e.g., orgId)
 * @returns The created webhook
 * @throws {WebhookError} If the API request fails
 *
 * @example
 * ```typescript
 * const webhook = await createWebhook(client, {
 *   name: 'github-events',
 *   description: 'Receives GitHub webhook events',
 * });
 * console.log(`Created webhook: ${webhook.id}`);
 * ```
 */
export async function createWebhook(
	client: APIClient,
	params: CreateWebhookRequest,
	options?: WebhookApiOptions
): Promise<Webhook> {
	const url = webhookApiPath('create');
	const resp = await client.post(
		url,
		params,
		WebhookResponseSchema,
		CreateWebhookRequestSchema,
		undefined,
		buildWebhookHeaders(options?.orgId)
	);

	if (resp.success) {
		return resp.data;
	}

	throw new WebhookError({
		message: resp.message || 'Failed to create webhook',
	});
}

/**
 * Get a webhook by ID.
 *
 * Retrieves the webhook details.
 *
 * @param client - The API client instance
 * @param webhookId - The webhook ID (prefixed with wh_)
 * @param options - Optional API options (e.g., orgId)
 * @returns The webhook details
 * @throws {WebhookNotFoundError} If the webhook does not exist
 * @throws {WebhookError} If the API request fails
 *
 * @example
 * ```typescript
 * const webhook = await getWebhook(client, 'wh_abc123');
 * console.log(`Webhook: ${webhook.name}`);
 * ```
 */
export async function getWebhook(
	client: APIClient,
	webhookId: string,
	options?: WebhookApiOptions
): Promise<Webhook> {
	const url = webhookApiPath('get', webhookId);
	const resp = await withWebhookErrorHandling(
		() => client.get(url, WebhookResponseSchema, undefined, buildWebhookHeaders(options?.orgId)),
		{ webhookId }
	);

	if (resp.success) {
		return resp.data;
	}

	throw new WebhookError({
		webhookId,
		message: resp.message || 'Failed to get webhook',
	});
}

/**
 * List all webhooks with optional pagination.
 *
 * @param client - The API client instance
 * @param params - Optional pagination parameters
 * @param options - Optional API options (e.g., orgId)
 * @returns Object containing the list of webhooks
 * @throws {WebhookError} If the API request fails
 *
 * @example
 * ```typescript
 * // List first 10 webhooks
 * const { webhooks } = await listWebhooks(client, { limit: 10 });
 * console.log(`Found ${webhooks.length} webhooks`);
 *
 * // Paginate through all webhooks
 * const { webhooks: page2 } = await listWebhooks(client, { limit: 10, offset: 10 });
 * ```
 */
export async function listWebhooks(
	client: APIClient,
	params?: ListWebhooksRequest,
	options?: WebhookApiOptions
): Promise<{ webhooks: Webhook[] }> {
	const searchParams = new URLSearchParams();
	if (params?.limit !== undefined) {
		searchParams.set('limit', String(params.limit));
	}
	if (params?.offset !== undefined) {
		searchParams.set('offset', String(params.offset));
	}

	const queryString = searchParams.toString();
	const url = webhookApiPathWithQuery('list', queryString || undefined);
	const resp = await client.get(
		url,
		WebhooksListResponseSchema,
		undefined,
		buildWebhookHeaders(options?.orgId)
	);

	if (resp.success) {
		return { webhooks: resp.data };
	}

	throw new WebhookError({
		message: resp.message || 'Failed to list webhooks',
	});
}

/**
 * Update an existing webhook.
 *
 * Updates the webhook name and/or description.
 *
 * @param client - The API client instance
 * @param webhookId - The webhook ID (prefixed with wh_)
 * @param params - Update parameters
 * @param options - Optional API options (e.g., orgId)
 * @returns The updated webhook
 * @throws {WebhookNotFoundError} If the webhook does not exist
 * @throws {WebhookError} If the API request fails
 *
 * @example
 * ```typescript
 * const webhook = await updateWebhook(client, 'wh_abc123', {
 *   name: 'github-events-v2',
 *   description: 'Updated description',
 * });
 * ```
 */
export async function updateWebhook(
	client: APIClient,
	webhookId: string,
	params: UpdateWebhookRequest,
	options?: WebhookApiOptions
): Promise<Webhook> {
	const url = webhookApiPath('update', webhookId);
	const resp = await withWebhookErrorHandling(
		() =>
			client.put(
				url,
				params,
				WebhookResponseSchema,
				UpdateWebhookRequestSchema,
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
		message: resp.message || 'Failed to update webhook',
	});
}

/**
 * Delete a webhook.
 *
 * Permanently deletes a webhook and all its destinations, receipts, and deliveries.
 * This action cannot be undone.
 *
 * @param client - The API client instance
 * @param webhookId - The webhook ID (prefixed with wh_)
 * @param options - Optional API options (e.g., orgId)
 * @throws {WebhookNotFoundError} If the webhook does not exist
 * @throws {WebhookError} If the API request fails
 *
 * @example
 * ```typescript
 * await deleteWebhook(client, 'wh_abc123');
 * console.log('Webhook deleted');
 * ```
 */
export async function deleteWebhook(
	client: APIClient,
	webhookId: string,
	options?: WebhookApiOptions
): Promise<void> {
	const url = webhookApiPath('delete', webhookId);
	const resp = await withWebhookErrorHandling(
		() =>
			client.delete(
				url,
				DeleteWebhookResponseSchema,
				undefined,
				buildWebhookHeaders(options?.orgId)
			),
		{ webhookId }
	);

	if (resp.success) {
		return;
	}

	throw new WebhookError({
		webhookId,
		message: resp.message || 'Failed to delete webhook',
	});
}
