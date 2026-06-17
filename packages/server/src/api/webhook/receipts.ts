import { z } from 'zod';
import { type APIClient, APIResponseSchema } from '../api.ts';
import {
	type ListWebhookReceiptsRequest,
	type WebhookApiOptions,
	type WebhookReceipt,
	WebhookReceiptSchema,
} from './types.ts';
import {
	buildWebhookHeaders,
	WebhookError,
	webhookApiPath,
	webhookApiPathWithQuery,
	withWebhookErrorHandling,
} from './util.ts';

export const WebhookReceiptResponseSchema = APIResponseSchema(WebhookReceiptSchema);
export const WebhookReceiptsListResponseSchema = APIResponseSchema(z.array(WebhookReceiptSchema));

/**
 * List receipts for a webhook with optional pagination.
 *
 * Receipts represent incoming webhook payloads that were received.
 *
 * @param client - The API client instance
 * @param webhookId - The webhook ID (prefixed with wh_)
 * @param params - Optional pagination parameters
 * @param options - Optional API options (e.g., orgId)
 * @returns Object containing the list of receipts
 * @throws {WebhookNotFoundError} If the webhook does not exist
 * @throws {WebhookError} If the API request fails
 *
 * @example
 * ```typescript
 * const { receipts } = await listWebhookReceipts(client, 'wh_abc123', { limit: 10 });
 * for (const receipt of receipts) {
 *   console.log(`Receipt ${receipt.id}: received at ${receipt.date}`);
 * }
 * ```
 */
export async function listWebhookReceipts(
	client: APIClient,
	webhookId: string,
	params?: ListWebhookReceiptsRequest,
	options?: WebhookApiOptions
): Promise<{ receipts: WebhookReceipt[] }> {
	const searchParams = new URLSearchParams();
	if (params?.limit !== undefined) {
		searchParams.set('limit', String(params.limit));
	}
	if (params?.offset !== undefined) {
		searchParams.set('offset', String(params.offset));
	}

	const queryString = searchParams.toString();
	const url = webhookApiPathWithQuery('receipt-list', queryString || undefined, webhookId);
	const resp = await withWebhookErrorHandling(
		() =>
			client.get(
				url,
				WebhookReceiptsListResponseSchema,
				undefined,
				buildWebhookHeaders(options?.orgId)
			),
		{ webhookId }
	);

	if (resp.success) {
		return { receipts: resp.data };
	}

	throw new WebhookError({
		webhookId,
		message: resp.message || 'Failed to list webhook receipts',
	});
}

/**
 * Get a specific receipt for a webhook.
 *
 * Retrieves the full receipt details including headers and payload.
 *
 * @param client - The API client instance
 * @param webhookId - The webhook ID (prefixed with wh_)
 * @param receiptId - The receipt ID (prefixed with whrc_)
 * @param options - Optional API options (e.g., orgId)
 * @returns The receipt details
 * @throws {WebhookReceiptNotFoundError} If the receipt does not exist
 * @throws {WebhookNotFoundError} If the webhook does not exist
 * @throws {WebhookError} If the API request fails
 *
 * @example
 * ```typescript
 * const receipt = await getWebhookReceipt(client, 'wh_abc123', 'whrc_def456');
 * console.log(`Receipt payload:`, receipt.payload);
 * ```
 */
export async function getWebhookReceipt(
	client: APIClient,
	webhookId: string,
	receiptId: string,
	options?: WebhookApiOptions
): Promise<WebhookReceipt> {
	const url = webhookApiPath('receipt-get', webhookId, receiptId);
	const resp = await withWebhookErrorHandling(
		() =>
			client.get(
				url,
				WebhookReceiptResponseSchema,
				undefined,
				buildWebhookHeaders(options?.orgId)
			),
		{ webhookId, receiptId }
	);

	if (resp.success) {
		return resp.data;
	}

	throw new WebhookError({
		webhookId,
		message: resp.message || 'Failed to get webhook receipt',
	});
}
