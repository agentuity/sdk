import { z } from 'zod';

// ============================================================================
// Webhook Destination Types
// ============================================================================

/**
 * Webhook destination type schema.
 *
 * Currently only 'url' destinations are supported.
 *
 * @example
 * ```typescript
 * const destType = WebhookDestinationTypeSchema.parse('url');
 * ```
 */
export const WebhookDestinationTypeSchema = z.enum(['url']);

/**
 * Webhook destination type.
 */
export type WebhookDestinationType = z.infer<typeof WebhookDestinationTypeSchema>;

// ============================================================================
// Webhook Delivery Status
// ============================================================================

/**
 * Webhook delivery status schema.
 *
 * - `pending`: Delivery is queued and waiting to be sent.
 * - `success`: Delivery was completed successfully.
 * - `failed`: Delivery failed after all retry attempts.
 *
 * @example
 * ```typescript
 * const status = WebhookDeliveryStatusSchema.parse('success');
 * ```
 */
export const WebhookDeliveryStatusSchema = z.enum(['pending', 'success', 'failed']);

/**
 * Webhook delivery status type.
 */
export type WebhookDeliveryStatus = z.infer<typeof WebhookDeliveryStatusSchema>;

// ============================================================================
// Core Schemas
// ============================================================================

/**
 * Webhook schema representing a webhook endpoint.
 *
 * @example
 * ```typescript
 * const webhook = await getWebhook(client, 'wh_abc123');
 * console.log(`Webhook: ${webhook.name} (${webhook.id})`);
 * ```
 */
export const WebhookSchema = z.object({
	/** Unique identifier for the webhook (prefixed with wh_). */
	id: z.string(),
	/** ISO 8601 timestamp when the webhook was created. */
	created_at: z.string(),
	/** ISO 8601 timestamp when the webhook was last updated. */
	updated_at: z.string(),
	/** ID of the user who created the webhook. */
	created_by: z.string(),
	/** Human-readable webhook name. */
	name: z.string(),
	/** Optional description of the webhook's purpose. */
	description: z.string().nullable().optional(),
});

/**
 * Webhook type.
 */
export type Webhook = z.infer<typeof WebhookSchema>;

/**
 * Webhook destination schema representing a delivery target for webhook events.
 *
 * Destinations define where incoming webhook payloads are forwarded to.
 *
 * @example
 * ```typescript
 * const destinations = await listWebhookDestinations(client, 'wh_abc123');
 * for (const dest of destinations) {
 *   console.log(`Destination ${dest.id}: type=${dest.type}`);
 * }
 * ```
 */
export const WebhookDestinationSchema = z.object({
	/** Unique identifier for the destination (prefixed with whds_). */
	id: z.string(),
	/** ISO 8601 timestamp when the destination was created. */
	created_at: z.string(),
	/** ISO 8601 timestamp when the destination was last updated. */
	updated_at: z.string(),
	/** ID of the user who created the destination. */
	created_by: z.string(),
	/** ID of the webhook this destination belongs to. */
	webhook_id: z.string(),
	/** Type of destination (currently only 'url'). */
	type: z.string(),
	/** Configuration object for the destination (e.g., URL, headers). */
	config: z.record(z.string(), z.unknown()),
});

/**
 * Webhook destination type.
 */
export type WebhookDestination = z.infer<typeof WebhookDestinationSchema>;

/**
 * Webhook receipt schema representing an incoming webhook payload that was received.
 *
 * Receipts capture the raw payload and headers of each incoming webhook request.
 *
 * @example
 * ```typescript
 * const receipt = await getWebhookReceipt(client, 'wh_abc123', 'whrc_def456');
 * console.log(`Receipt ${receipt.id}: received at ${receipt.date}`);
 * ```
 */
export const WebhookReceiptSchema = z.object({
	/** Unique identifier for the receipt (prefixed with whrc_). */
	id: z.string(),
	/** ISO 8601 timestamp when the receipt was recorded. */
	date: z.string(),
	/** ID of the webhook this receipt belongs to. */
	webhook_id: z.string(),
	/** HTTP headers from the incoming webhook request. */
	headers: z.record(z.string(), z.unknown()),
	/** Raw payload from the incoming webhook request (can be any type). */
	payload: z.unknown(),
});

/**
 * Webhook receipt type.
 */
export type WebhookReceipt = z.infer<typeof WebhookReceiptSchema>;

/**
 * Webhook delivery schema representing a delivery attempt to a destination.
 *
 * Deliveries track the status and result of forwarding a received webhook
 * payload to a configured destination.
 *
 * @example
 * ```typescript
 * const deliveries = await listWebhookDeliveries(client, 'wh_abc123');
 * for (const delivery of deliveries) {
 *   console.log(`Delivery ${delivery.id}: ${delivery.status}`);
 * }
 * ```
 */
export const WebhookDeliverySchema = z.object({
	/** Unique identifier for the delivery (prefixed with whdv_). */
	id: z.string(),
	/** ISO 8601 timestamp when the delivery was attempted. */
	date: z.string(),
	/** ID of the webhook this delivery belongs to. */
	webhook_id: z.string(),
	/** ID of the destination this delivery was sent to. */
	webhook_destination_id: z.string(),
	/** ID of the receipt that triggered this delivery. */
	webhook_receipt_id: z.string(),
	/** Current status of the delivery. */
	status: WebhookDeliveryStatusSchema,
	/** Number of retry attempts made. */
	retries: z.number(),
	/** Error message if the delivery failed. */
	error: z.string().nullable().optional(),
	/** Response data from the destination (if available). */
	response: z.record(z.string(), z.unknown()).nullable().optional(),
});

/**
 * Webhook delivery type.
 */
export type WebhookDelivery = z.infer<typeof WebhookDeliverySchema>;

// ============================================================================
// API Options
// ============================================================================

/**
 * Common options for webhook API calls.
 *
 * Used to pass organization context when calling from CLI or other
 * contexts where the org is not implicit in the authentication token.
 */
export interface WebhookApiOptions {
	/**
	 * Organization ID for the request.
	 * Required when using user authentication (CLI) instead of SDK key.
	 */
	orgId?: string;
}

// ============================================================================
// Request Schemas
// ============================================================================

/**
 * Request schema for creating a new webhook.
 *
 * @example
 * ```typescript
 * const request: CreateWebhookRequest = {
 *   name: 'github-events',
 *   description: 'Receives GitHub webhook events',
 * };
 * ```
 */
export const CreateWebhookRequestSchema = z.object({
	/** Human-readable name for the webhook. */
	name: z.string(),
	/** Optional description of the webhook's purpose. */
	description: z.string().optional(),
});

/** Request type for creating a webhook. */
export type CreateWebhookRequest = z.infer<typeof CreateWebhookRequestSchema>;

/**
 * Request schema for updating an existing webhook.
 *
 * @example
 * ```typescript
 * const request: UpdateWebhookRequest = {
 *   name: 'github-events-v2',
 *   description: 'Updated description',
 * };
 * ```
 */
export const UpdateWebhookRequestSchema = z.object({
	/** New name for the webhook. */
	name: z.string(),
	/** New description for the webhook. */
	description: z.string().optional(),
});

/** Request type for updating a webhook. */
export type UpdateWebhookRequest = z.infer<typeof UpdateWebhookRequestSchema>;

/**
 * Request schema for creating a webhook destination.
 *
 * @example
 * ```typescript
 * const request: CreateWebhookDestinationRequest = {
 *   type: 'url',
 *   config: { url: 'https://api.example.com/webhook' },
 * };
 * ```
 */
export const CreateWebhookDestinationRequestSchema = z.object({
	/** Type of destination to create. */
	type: WebhookDestinationTypeSchema,
	/** Configuration object for the destination. */
	config: z.record(z.string(), z.unknown()),
});

/** Request type for creating a webhook destination. */
export type CreateWebhookDestinationRequest = z.infer<typeof CreateWebhookDestinationRequestSchema>;

/**
 * Request schema for updating a webhook destination.
 *
 * @example
 * ```typescript
 * const request: UpdateWebhookDestinationRequest = {
 *   config: { url: 'https://api.example.com/webhook/v2' },
 * };
 * ```
 */
export const UpdateWebhookDestinationRequestSchema = z.object({
	/** Updated configuration object for the destination. */
	config: z.record(z.string(), z.unknown()).optional(),
});

/** Request type for updating a webhook destination. */
export type UpdateWebhookDestinationRequest = z.infer<typeof UpdateWebhookDestinationRequestSchema>;

/**
 * Request schema for listing webhooks with pagination.
 */
export const ListWebhooksRequestSchema = z.object({
	/** Maximum number of webhooks to return. */
	limit: z.number().optional(),
	/** Number of webhooks to skip for pagination. */
	offset: z.number().optional(),
});

/** Request type for listing webhooks. */
export type ListWebhooksRequest = z.infer<typeof ListWebhooksRequestSchema>;

/**
 * Request schema for listing webhook receipts with pagination.
 */
export const ListWebhookReceiptsRequestSchema = z.object({
	/** Maximum number of receipts to return. */
	limit: z.number().optional(),
	/** Number of receipts to skip for pagination. */
	offset: z.number().optional(),
});

/** Request type for listing webhook receipts. */
export type ListWebhookReceiptsRequest = z.infer<typeof ListWebhookReceiptsRequestSchema>;

/**
 * Request schema for listing webhook deliveries with pagination.
 */
export const ListWebhookDeliveriesRequestSchema = z.object({
	/** Maximum number of deliveries to return. */
	limit: z.number().optional(),
	/** Number of deliveries to skip for pagination. */
	offset: z.number().optional(),
});

/** Request type for listing webhook deliveries. */
export type ListWebhookDeliveriesRequest = z.infer<typeof ListWebhookDeliveriesRequestSchema>;
