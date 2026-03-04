export * from './service.ts';
/**
 * @module webhook
 *
 * Webhook API client for managing webhooks, destinations, receipts, and deliveries.
 *
 * This module provides a complete client for the Agentuity Webhook API, supporting:
 * - **Webhook Management**: Create, read, update, and delete webhooks
 * - **Destinations**: Configure URL endpoints for webhook payload forwarding
 * - **Receipts**: View incoming webhook payloads that were received
 * - **Deliveries**: Track delivery attempts and retry failed deliveries
 *
 * @example Basic Webhook Operations
 * ```typescript
 * import { createWebhook, createWebhookDestination, listWebhookReceipts } from '@agentuity/server';
 *
 * // Create a webhook
 * const webhook = await createWebhook(client, {
 *   name: 'github-events',
 *   description: 'Receives GitHub webhook events',
 * });
 *
 * // Add a destination
 * await createWebhookDestination(client, webhook.id, {
 *   type: 'url',
 *   config: { url: 'https://api.example.com/webhook' },
 * });
 *
 * // List receipts
 * const { receipts } = await listWebhookReceipts(client, webhook.id);
 * for (const receipt of receipts) {
 *   console.log(`Received: ${receipt.id} at ${receipt.date}`);
 * }
 * ```
 */

// ============================================================================
// Types & Schemas
// ============================================================================

export {
	type CreateWebhookDestinationRequest,
	CreateWebhookDestinationRequestSchema,
	type CreateWebhookRequest,
	CreateWebhookRequestSchema,
	type ListWebhookDeliveriesRequest,
	ListWebhookDeliveriesRequestSchema,
	type ListWebhookReceiptsRequest,
	ListWebhookReceiptsRequestSchema,
	type ListWebhooksRequest,
	ListWebhooksRequestSchema,
	type PaginationRequest,
	PaginationRequestSchema,
	type UpdateWebhookDestinationRequest,
	UpdateWebhookDestinationRequestSchema,
	type UpdateWebhookRequest,
	UpdateWebhookRequestSchema,
	type Webhook,
	type WebhookApiOptions,
	WebhookApiOptionsSchema,
	type WebhookDelivery,
	WebhookDeliverySchema,
	type WebhookDeliveryStatus,
	WebhookDeliveryStatusSchema,
	type WebhookDestination,
	WebhookDestinationSchema,
	type WebhookDestinationType,
	WebhookDestinationTypeSchema,
	type WebhookReceipt,
	WebhookReceiptSchema,
	WebhookSchema,
} from './types.ts';

// ============================================================================
// Errors
// ============================================================================

export {
	WebhookDeliveryNotFoundError,
	WebhookDestinationNotFoundError,
	WebhookError,
	WebhookNotFoundError,
	WebhookReceiptNotFoundError,
} from './util.ts';

// ============================================================================
// Webhook Operations
// ============================================================================

export {
	createWebhook,
	DeleteWebhookResponseSchema,
	deleteWebhook,
	getWebhook,
	listWebhooks,
	WebhookResponseSchema,
	WebhooksListResponseSchema,
	updateWebhook,
} from './webhooks.ts';

// ============================================================================
// Destination Operations
// ============================================================================

export {
	createWebhookDestination,
	DeleteWebhookDestinationResponseSchema,
	deleteWebhookDestination,
	listWebhookDestinations,
	updateWebhookDestination,
	WebhookDestinationResponseSchema,
	WebhookDestinationsListResponseSchema,
} from './destinations.ts';

// ============================================================================
// Receipt Operations
// ============================================================================

export {
	getWebhookReceipt,
	listWebhookReceipts,
	WebhookReceiptResponseSchema,
	WebhookReceiptsListResponseSchema,
} from './receipts.ts';

// ============================================================================
// Delivery Operations
// ============================================================================

export {
	listWebhookDeliveries,
	retryWebhookDelivery,
	WebhookDeliveriesListResponseSchema,
	WebhookDeliveryResponseSchema,
} from './deliveries.ts';
