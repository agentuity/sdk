import { StructuredError } from '@agentuity/core';
import { APIError } from '../api.ts';

// ============================================================================
// Error Types
// ============================================================================

/**
 * General webhook operation error.
 *
 * Thrown when a webhook operation fails for reasons other than not-found.
 *
 * @example
 * ```typescript
 * try {
 *   await createWebhook(client, { name: 'my-webhook' });
 * } catch (error) {
 *   if (error instanceof WebhookError) {
 *     console.error(`Webhook operation failed: ${error.message}`);
 *   }
 * }
 * ```
 */
export const WebhookError = StructuredError('WebhookError')<{ webhookId?: string }>();

/**
 * Error thrown when a webhook is not found.
 *
 * @example
 * ```typescript
 * try {
 *   await getWebhook(client, 'wh_nonexistent');
 * } catch (error) {
 *   if (error instanceof WebhookNotFoundError) {
 *     console.error(`Webhook not found: ${error.webhookId}`);
 *   }
 * }
 * ```
 */
export const WebhookNotFoundError = StructuredError('WebhookNotFoundError')<{
	webhookId: string;
}>();

/**
 * Error thrown when a webhook destination is not found.
 *
 * @example
 * ```typescript
 * try {
 *   await deleteWebhookDestination(client, 'wh_abc', 'whds_nonexistent');
 * } catch (error) {
 *   if (error instanceof WebhookDestinationNotFoundError) {
 *     console.error(`Destination ${error.destinationId} not found`);
 *   }
 * }
 * ```
 */
export const WebhookDestinationNotFoundError = StructuredError('WebhookDestinationNotFoundError')<{
	webhookId: string;
	destinationId: string;
}>();

/**
 * Error thrown when a webhook receipt is not found.
 *
 * @example
 * ```typescript
 * try {
 *   await getWebhookReceipt(client, 'wh_abc', 'whrc_nonexistent');
 * } catch (error) {
 *   if (error instanceof WebhookReceiptNotFoundError) {
 *     console.error(`Receipt ${error.receiptId} not found`);
 *   }
 * }
 * ```
 */
export const WebhookReceiptNotFoundError = StructuredError('WebhookReceiptNotFoundError')<{
	webhookId: string;
	receiptId: string;
}>();

/**
 * Error thrown when a webhook delivery is not found.
 *
 * @example
 * ```typescript
 * try {
 *   await retryWebhookDelivery(client, 'wh_abc', 'whdv_nonexistent');
 * } catch (error) {
 *   if (error instanceof WebhookDeliveryNotFoundError) {
 *     console.error(`Delivery ${error.deliveryId} not found`);
 *   }
 * }
 * ```
 */
export const WebhookDeliveryNotFoundError = StructuredError('WebhookDeliveryNotFoundError')<{
	webhookId: string;
	deliveryId: string;
}>();

// ============================================================================
// API Path Helpers
// ============================================================================

/** Current Webhook API version. */
const WEBHOOK_API_VERSION = '2026-02-24';

/**
 * Constructs a full API path for webhook operations.
 *
 * Pattern: `/webhook/${VERSION}/${verb}/${segments.join('/')}`
 * Each verb is unique to avoid route conflicts with the Go mux.
 *
 * @param verb - The action verb (e.g., 'create', 'list', 'get', 'destination-list')
 * @param segments - Additional path segments (e.g., webhook ID, sub-resource ID)
 * @returns The full API path with version and verb prefix
 *
 * @internal
 */
export function webhookApiPath(verb: string, ...segments: string[]): string {
	const encoded = segments.map((s) => encodeURIComponent(s)).join('/');
	if (encoded) {
		return `/webhook/${WEBHOOK_API_VERSION}/${verb}/${encoded}`;
	}
	return `/webhook/${WEBHOOK_API_VERSION}/${verb}`;
}

/**
 * Constructs a full API path for webhook operations with query string.
 *
 * @param verb - The action verb
 * @param queryString - Query string to append (without leading ?)
 * @param segments - Additional path segments
 * @returns The full API path with version, verb, and query string
 *
 * @internal
 */
export function webhookApiPathWithQuery(
	verb: string,
	queryString: string | undefined,
	...segments: string[]
): string {
	const basePath = webhookApiPath(verb, ...segments);
	return queryString ? `${basePath}?${queryString}` : basePath;
}

/**
 * Constructs the public ingest URL for a webhook.
 *
 * Pattern: `/webhook/{orgId}-{webhookId}` (non-versioned, public)
 *
 * @param orgId - The organization ID
 * @param webhookId - The webhook ID (prefixed with wh_)
 * @returns The public ingest URL
 *
 * @internal
 */
export function webhookIngestPath(orgId: string, webhookId: string): string {
	return `/webhook/${encodeURIComponent(orgId)}-${encodeURIComponent(webhookId)}`;
}

// ============================================================================
// Header Builder
// ============================================================================

/**
 * Builds headers for webhook API requests.
 *
 * @param orgId - Optional organization ID for CLI authentication
 * @returns Headers object to pass to API client
 *
 * @internal
 */
export function buildWebhookHeaders(orgId?: string): Record<string, string> | undefined {
	if (orgId) {
		return { 'x-agentuity-orgid': orgId };
	}
	return undefined;
}

// ============================================================================
// Error Handling
// ============================================================================

/**
 * Wraps an API call and translates APIError with HTTP status codes to domain-specific webhook errors.
 *
 * - 404 → WebhookNotFoundError / WebhookDestinationNotFoundError / WebhookReceiptNotFoundError / WebhookDeliveryNotFoundError
 *
 * @internal
 */
export async function withWebhookErrorHandling<T>(
	apiCall: () => Promise<T>,
	context: {
		webhookId?: string;
		destinationId?: string;
		receiptId?: string;
		deliveryId?: string;
	}
): Promise<T> {
	try {
		return await apiCall();
	} catch (error) {
		if (error instanceof APIError) {
			if (error.status === 404) {
				if (context.deliveryId && context.webhookId) {
					throw new WebhookDeliveryNotFoundError({
						webhookId: context.webhookId,
						deliveryId: context.deliveryId,
						message: error.message,
					});
				}
				if (context.receiptId && context.webhookId) {
					throw new WebhookReceiptNotFoundError({
						webhookId: context.webhookId,
						receiptId: context.receiptId,
						message: error.message,
					});
				}
				if (context.destinationId && context.webhookId) {
					throw new WebhookDestinationNotFoundError({
						webhookId: context.webhookId,
						destinationId: context.destinationId,
						message: error.message,
					});
				}
				if (context.webhookId) {
					throw new WebhookNotFoundError({
						webhookId: context.webhookId,
						message: error.message,
					});
				}
			}
		}
		throw error;
	}
}
