import { z } from 'zod';

// ============================================================================
// Webhook Destination Types
// ============================================================================

export const WebhookDestinationTypeSchema = z
	.enum(['url'])
	.describe('Webhook destination type. Currently only url destinations are supported');

export type WebhookDestinationType = z.infer<typeof WebhookDestinationTypeSchema>;

// ============================================================================
// Webhook Delivery Status
// ============================================================================

export const WebhookDeliveryStatusSchema = z
	.enum(['pending', 'success', 'failed'])
	.describe(
		'Webhook delivery status. pending: queued and waiting to be sent. success: completed successfully. failed: failed after all retry attempts'
	);

export type WebhookDeliveryStatus = z.infer<typeof WebhookDeliveryStatusSchema>;

// ============================================================================
// Core Schemas
// ============================================================================

export const WebhookSchema = z
	.object({
		id: z.string().describe('Unique identifier for the webhook (prefixed with wh_)'),
		created_at: z.string().describe('ISO 8601 timestamp when the webhook was created'),
		updated_at: z.string().describe('ISO 8601 timestamp when the webhook was last updated'),
		created_by: z.string().describe('ID of the user who created the webhook'),
		name: z.string().describe('Human-readable webhook name'),
		description: z.string().nullable().describe("Optional description of the webhook's purpose"),
		url: z
			.string()
			.optional()
			.describe(
				'Fully-qualified ingest URL for sending events to this webhook when returned by the service'
			),
		internal: z
			.boolean()
			.describe(
				'Whether this is a system-managed webhook (e.g., S3 bucket notifications). Internal webhooks cannot be modified or deleted by users'
			),
		metadata: z
			.record(z.string(), z.unknown())
			.nullable()
			.describe(
				'System metadata for internal webhooks (e.g., bucket_name, type). Null for user-created webhooks'
			),
	})
	.describe('Webhook endpoint configuration');

export type Webhook = z.infer<typeof WebhookSchema>;

export const WebhookDestinationSchema = z
	.object({
		id: z.string().describe('Unique identifier for the destination (prefixed with whds_)'),
		created_at: z.string().describe('ISO 8601 timestamp when the destination was created'),
		updated_at: z.string().describe('ISO 8601 timestamp when the destination was last updated'),
		created_by: z.string().describe('ID of the user who created the destination'),
		webhook_id: z.string().describe('ID of the webhook this destination belongs to'),
		type: WebhookDestinationTypeSchema.describe("Type of destination (currently only 'url')"),
		config: z
			.record(z.string(), z.unknown())
			.describe('Configuration object for the destination (e.g., URL, headers)'),
		internal: z
			.boolean()
			.describe(
				'Whether this is a system-managed destination. Internal destinations cannot be modified or deleted by users'
			),
		metadata: z
			.record(z.string(), z.unknown())
			.nullable()
			.describe(
				'System metadata for internal destinations (e.g., bucket_name, type). Null for user-created destinations'
			),
	})
	.describe('Webhook destination representing a delivery target for webhook events');

export type WebhookDestination = z.infer<typeof WebhookDestinationSchema>;

export const WebhookReceiptSchema = z
	.object({
		id: z.string().describe('Unique identifier for the receipt (prefixed with whrc_)'),
		date: z.string().describe('ISO 8601 timestamp when the receipt was recorded'),
		webhook_id: z.string().describe('ID of the webhook this receipt belongs to'),
		headers: z
			.record(z.string(), z.string())
			.describe('HTTP headers from the incoming webhook request'),
		payload: z
			.unknown()
			.describe('Raw payload from the incoming webhook request (can be any type)'),
	})
	.describe('Webhook receipt representing an incoming webhook payload that was received');

export type WebhookReceipt = z.infer<typeof WebhookReceiptSchema>;

export const WebhookDeliverySchema = z
	.object({
		id: z.string().describe('Unique identifier for the delivery (prefixed with whdv_)'),
		date: z.string().describe('ISO 8601 timestamp when the delivery was attempted'),
		webhook_id: z.string().describe('ID of the webhook this delivery belongs to'),
		webhook_destination_id: z
			.string()
			.describe('ID of the destination this delivery was sent to'),
		webhook_receipt_id: z.string().describe('ID of the receipt that triggered this delivery'),
		status: WebhookDeliveryStatusSchema.describe('Current status of the delivery'),
		retries: z.number().describe('Number of retry attempts made'),
		error: z.string().nullable().describe('Error message if the delivery failed'),
		response: z
			.record(z.string(), z.unknown())
			.nullable()
			.describe('Response data from the destination (if available)'),
	})
	.describe('Webhook delivery representing a delivery attempt to a destination');

export type WebhookDelivery = z.infer<typeof WebhookDeliverySchema>;

// ============================================================================
// Analytics Types
// ============================================================================

export const WebhookAnalyticsGranularitySchema = z
	.enum(['minute', 'hour', 'day'])
	.describe('Time bucket granularity for analytics queries');

export type WebhookAnalyticsGranularity = z.infer<typeof WebhookAnalyticsGranularitySchema>;

export const WebhookAnalyticsOptionsSchema = z
	.object({
		start: z.string().optional().describe('ISO 8601 start time for the analytics window'),
		end: z.string().optional().describe('ISO 8601 end time for the analytics window'),
		granularity: WebhookAnalyticsGranularitySchema.optional().describe('Time bucket granularity'),
		orgId: z.string().optional().describe('Organization ID for CLI-authenticated requests'),
	})
	.describe('Options for webhook analytics queries');

export type WebhookAnalyticsOptions = z.infer<typeof WebhookAnalyticsOptionsSchema>;

export const WebhookTimePeriodSchema = z
	.object({
		start: z.string().describe('ISO 8601 start time'),
		end: z.string().describe('ISO 8601 end time'),
		granularity: WebhookAnalyticsGranularitySchema.optional(),
	})
	.describe('Time period for analytics data');

export type WebhookTimePeriod = z.infer<typeof WebhookTimePeriodSchema>;

export const WebhookAnalyticsSummarySchema = z
	.object({
		total_received: z.number().describe('Total webhook receipts in the period'),
		total_delivered: z.number().describe('Total successful deliveries in the period'),
		total_failed: z.number().describe('Total failed deliveries in the period'),
	})
	.describe('Summary analytics for webhook activity');

export type WebhookAnalyticsSummary = z.infer<typeof WebhookAnalyticsSummarySchema>;

export const WebhookOrgAnalyticsSchema = z
	.object({
		period: WebhookTimePeriodSchema,
		summary: WebhookAnalyticsSummarySchema,
	})
	.describe('Org-level webhook analytics response');

export type WebhookOrgAnalytics = z.infer<typeof WebhookOrgAnalyticsSchema>;

export const WebhookTimeSeriesPointSchema = z
	.object({
		timestamp: z.string().describe('ISO 8601 timestamp for this data point'),
		received: z.number().describe('Number of receipts in this bucket'),
		delivered: z.number().describe('Number of successful deliveries in this bucket'),
		failed: z.number().describe('Number of failed deliveries in this bucket'),
	})
	.describe('Single data point in webhook time series');

export type WebhookTimeSeriesPoint = z.infer<typeof WebhookTimeSeriesPointSchema>;

export const WebhookTimeSeriesDataSchema = z
	.object({
		period: WebhookTimePeriodSchema,
		series: z.array(WebhookTimeSeriesPointSchema),
	})
	.describe('Webhook time series analytics data');

export type WebhookTimeSeriesData = z.infer<typeof WebhookTimeSeriesDataSchema>;

// ============================================================================
// API Options
// ============================================================================

export const WebhookApiOptionsSchema = z
	.object({
		orgId: z
			.string()
			.optional()
			.describe('Organization ID for CLI-authenticated requests without embedded org context'),
	})
	.describe('Common options for webhook API calls');

export type WebhookApiOptions = z.infer<typeof WebhookApiOptionsSchema>;

// ============================================================================
// Request Schemas
// ============================================================================

export const CreateWebhookRequestSchema = z
	.object({
		name: z.string().describe('Human-readable name for the webhook'),
		description: z.string().optional().describe("Optional description of the webhook's purpose"),
		internal: z.boolean().optional().describe('Whether the webhook is system-managed.'),
	})
	.describe('Request for creating a new webhook');

export type CreateWebhookRequest = z.infer<typeof CreateWebhookRequestSchema>;

export const UpdateWebhookRequestSchema = z
	.object({
		name: z.string().describe('New name for the webhook'),
		description: z.string().optional().describe('New description for the webhook'),
	})
	.describe('Request for updating an existing webhook');

export type UpdateWebhookRequest = z.infer<typeof UpdateWebhookRequestSchema>;

export const CreateWebhookDestinationRequestSchema = z
	.object({
		type: WebhookDestinationTypeSchema.describe('Type of destination to create'),
		config: z
			.record(z.string(), z.unknown())
			.describe('Configuration object for the destination'),
	})
	.describe('Request for creating a webhook destination');

export type CreateWebhookDestinationRequest = z.infer<typeof CreateWebhookDestinationRequestSchema>;

export const UpdateWebhookDestinationRequestSchema = z
	.object({
		config: z
			.record(z.string(), z.unknown())
			.optional()
			.describe('Updated configuration object for the destination'),
	})
	.describe('Request for updating a webhook destination');

export type UpdateWebhookDestinationRequest = z.infer<typeof UpdateWebhookDestinationRequestSchema>;

export const PaginationRequestSchema = z
	.object({
		limit: z.number().optional().describe('Maximum number of items to return'),
		offset: z.number().optional().describe('Number of items to skip for pagination'),
	})
	.describe('Pagination options for list requests');

export type PaginationRequest = z.infer<typeof PaginationRequestSchema>;

export const ListWebhooksRequestSchema = PaginationRequestSchema.describe(
	'Request for listing webhooks'
);

export type ListWebhooksRequest = z.infer<typeof ListWebhooksRequestSchema>;

export const ListWebhookReceiptsRequestSchema = PaginationRequestSchema.describe(
	'Request for listing webhook receipts'
);

export type ListWebhookReceiptsRequest = z.infer<typeof ListWebhookReceiptsRequestSchema>;

export const ListWebhookDeliveriesRequestSchema = PaginationRequestSchema.describe(
	'Request for listing webhook deliveries'
);

export type ListWebhookDeliveriesRequest = z.infer<typeof ListWebhookDeliveriesRequestSchema>;
