import { z } from 'zod';
import { type APIClient, APIResponseSchema } from '../api.ts';
import {
	type ListWebhookDeliveriesRequest,
	type WebhookApiOptions,
	type WebhookDelivery,
	WebhookDeliverySchema,
} from './types.ts';
import {
	buildWebhookHeaders,
	WebhookError,
	webhookApiPath,
	webhookApiPathWithQuery,
	withWebhookErrorHandling,
} from './util.ts';

export const WebhookDeliveryResponseSchema = APIResponseSchema(WebhookDeliverySchema);
export const WebhookDeliveriesListResponseSchema = APIResponseSchema(
	z.array(WebhookDeliverySchema)
);

/**
 * List deliveries for a webhook with optional pagination.
 *
 * Deliveries represent attempts to forward a received webhook payload to a destination.
 *
 * @param client - The API client instance
 * @param webhookId - The webhook ID (prefixed with wh_)
 * @param params - Optional pagination parameters
 * @param options - Optional API options (e.g., orgId)
 * @returns Object containing the list of deliveries
 * @throws {WebhookNotFoundError} If the webhook does not exist
 * @throws {WebhookError} If the API request fails
 *
 * @example
 * ```typescript
 * const { deliveries } = await listWebhookDeliveries(client, 'wh_abc123', { limit: 10 });
 * for (const delivery of deliveries) {
 *   console.log(`Delivery ${delivery.id}: ${delivery.status}`);
 * }
 * ```
 */
export async function listWebhookDeliveries(
	client: APIClient,
	webhookId: string,
	params?: ListWebhookDeliveriesRequest,
	options?: WebhookApiOptions
): Promise<{ deliveries: WebhookDelivery[] }> {
	const searchParams = new URLSearchParams();
	if (params?.limit !== undefined) {
		searchParams.set('limit', String(params.limit));
	}
	if (params?.offset !== undefined) {
		searchParams.set('offset', String(params.offset));
	}

	const queryString = searchParams.toString();
	const url = webhookApiPathWithQuery('delivery-list', queryString || undefined, webhookId);
	const resp = await withWebhookErrorHandling(
		() =>
			client.get(
				url,
				WebhookDeliveriesListResponseSchema,
				undefined,
				buildWebhookHeaders(options?.orgId)
			),
		{ webhookId }
	);

	if (resp.success) {
		return { deliveries: resp.data };
	}

	throw new WebhookError({
		webhookId,
		message: resp.message || 'Failed to list webhook deliveries',
	});
}

/**
 * Retry a failed webhook delivery.
 *
 * Re-attempts delivery of a webhook payload to the destination. This creates
 * a new delivery attempt for the same receipt and destination.
 *
 * @param client - The API client instance
 * @param webhookId - The webhook ID (prefixed with wh_)
 * @param deliveryId - The delivery ID to retry (prefixed with whdv_)
 * @param options - Optional API options (e.g., orgId)
 * @returns The new delivery attempt
 * @throws {WebhookDeliveryNotFoundError} If the delivery does not exist
 * @throws {WebhookNotFoundError} If the webhook does not exist
 * @throws {WebhookError} If the API request fails
 *
 * @example
 * ```typescript
 * const delivery = await retryWebhookDelivery(client, 'wh_abc123', 'whdv_def456');
 * console.log(`Retry delivery ${delivery.id}: ${delivery.status}`);
 * ```
 */
export async function retryWebhookDelivery(
	client: APIClient,
	webhookId: string,
	deliveryId: string,
	options?: WebhookApiOptions
): Promise<WebhookDelivery> {
	const url = webhookApiPath('delivery-retry', webhookId, deliveryId);
	const resp = await withWebhookErrorHandling(
		() =>
			client.post(
				url,
				{},
				WebhookDeliveryResponseSchema,
				z.object({}),
				undefined,
				buildWebhookHeaders(options?.orgId)
			),
		{ webhookId, deliveryId }
	);

	if (resp.success) {
		return resp.data;
	}

	throw new WebhookError({
		webhookId,
		message: resp.message || 'Failed to retry webhook delivery',
	});
}
