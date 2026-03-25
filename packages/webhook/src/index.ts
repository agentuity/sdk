export {
	WebhookService,
	type Webhook,
	type WebhookDestination,
	type WebhookDelivery,
	type WebhookReceipt,
	type CreateWebhookRequest,
	type CreateWebhookDestinationRequest,
	type UpdateWebhookRequest,
	type WebhookApiOptions,
	type WebhookDeliveryStatus,
	type WebhookDestinationType,
	type WebhookAnalyticsGranularity,
	type WebhookAnalyticsOptions,
	type WebhookAnalyticsSummary,
	type WebhookOrgAnalytics,
	type WebhookTimePeriod,
	type WebhookTimeSeriesData,
	type WebhookTimeSeriesPoint,
	type CreateWebhookParams,
	type UpdateWebhookParams,
	type CreateWebhookDestinationParams,
	type WebhookListResult,
	type WebhookGetResult,
	type WebhookCreateResult,
	type UpdateWebhookResult,
	type CreateDestinationResult,
	type ListDestinationsResult,
	type WebhookReceiptListResult,
	type WebhookDeliveryListResult,
	WebhookSchema,
	WebhookDestinationSchema,
	WebhookDeliverySchema,
	WebhookReceiptSchema,
	CreateWebhookRequestSchema,
	CreateWebhookDestinationRequestSchema,
	UpdateWebhookRequestSchema,
	WebhookApiOptionsSchema,
	WebhookDeliveryStatusSchema,
	WebhookDestinationTypeSchema,
	WebhookAnalyticsGranularitySchema,
	WebhookAnalyticsOptionsSchema,
	WebhookAnalyticsSummarySchema,
	WebhookOrgAnalyticsSchema,
	WebhookTimePeriodSchema,
	WebhookTimeSeriesDataSchema,
	WebhookTimeSeriesPointSchema,
	WebhookNotFoundError,
	WebhookDestinationNotFoundError,
	WebhookDeliveryNotFoundError,
	WebhookReceiptNotFoundError,
	WebhookError,
} from '@agentuity/core/webhook';

import {
	WebhookService,
	type CreateWebhookParams,
	type UpdateWebhookParams,
	type CreateWebhookDestinationParams,
	type WebhookCreateResult,
	type WebhookListResult,
	type WebhookGetResult,
	type UpdateWebhookResult,
	type CreateDestinationResult,
	type ListDestinationsResult,
	type WebhookReceiptListResult,
	type WebhookDeliveryListResult,
	type WebhookOrgAnalytics,
	type WebhookReceipt,
} from '@agentuity/core/webhook';
import { createServerFetchAdapter, buildClientHeaders, type Logger } from '@agentuity/adapter';
import { createMinimalLogger } from '@agentuity/core';
import { getEnv } from '@agentuity/core';
import { getServiceUrls } from '@agentuity/core/config';
import { z } from 'zod';

const isLogger = (val: unknown): val is Logger =>
	typeof val === 'object' &&
	val !== null &&
	['info', 'warn', 'error', 'debug', 'trace'].every(
		(m) => typeof (val as Record<string, unknown>)[m] === 'function'
	);

export const WebhookClientOptionsSchema = z.object({
	apiKey: z.string().optional().describe('API key for authentication'),
	url: z.string().optional().describe('Base URL for the Webhook API'),
	orgId: z.string().optional().describe('Organization ID for multi-tenant operations'),
	logger: z.custom<Logger>(isLogger).optional().describe('Custom logger instance'),
});
export type WebhookClientOptions = z.infer<typeof WebhookClientOptionsSchema>;

export class WebhookClient {
	readonly #service: WebhookService;

	constructor(options: WebhookClientOptions = {}) {
		const validatedOptions = WebhookClientOptionsSchema.parse(options);
		const apiKey =
			validatedOptions.apiKey || getEnv('AGENTUITY_SDK_KEY') || getEnv('AGENTUITY_CLI_KEY');
		const region = getEnv('AGENTUITY_REGION') ?? 'usc';
		const serviceUrls = getServiceUrls(region);

		const url = validatedOptions.url || getEnv('AGENTUITY_WEBHOOK_URL') || serviceUrls.catalyst;

		const logger = validatedOptions.logger ?? createMinimalLogger();

		const headers = buildClientHeaders({
			apiKey,
			orgId: validatedOptions.orgId,
		});

		const adapter = createServerFetchAdapter({ headers }, logger);
		this.#service = new WebhookService(url, adapter);
	}

	async create(params: CreateWebhookParams): Promise<WebhookCreateResult> {
		return this.#service.create(params);
	}

	async list(params?: { limit?: number; offset?: number }): Promise<WebhookListResult> {
		return this.#service.list(params);
	}

	async get(webhookId: string): Promise<WebhookGetResult> {
		return this.#service.get(webhookId);
	}

	async update(webhookId: string, params: UpdateWebhookParams): Promise<UpdateWebhookResult> {
		return this.#service.update(webhookId, params);
	}

	async delete(webhookId: string): Promise<void> {
		return this.#service.delete(webhookId);
	}

	async createDestination(
		webhookId: string,
		params: CreateWebhookDestinationParams
	): Promise<CreateDestinationResult> {
		return this.#service.createDestination(webhookId, params);
	}

	async listDestinations(webhookId: string): Promise<ListDestinationsResult> {
		return this.#service.listDestinations(webhookId);
	}

	async deleteDestination(webhookId: string, destinationId: string): Promise<void> {
		return this.#service.deleteDestination(webhookId, destinationId);
	}

	async listReceipts(
		webhookId: string,
		params?: { limit?: number; offset?: number }
	): Promise<WebhookReceiptListResult> {
		return this.#service.listReceipts(webhookId, params);
	}

	async getReceipt(webhookId: string, receiptId: string): Promise<WebhookReceipt> {
		return this.#service.getReceipt(webhookId, receiptId);
	}

	async listDeliveries(
		webhookId: string,
		params?: { limit?: number; offset?: number }
	): Promise<WebhookDeliveryListResult> {
		return this.#service.listDeliveries(webhookId, params);
	}

	async retryDelivery(webhookId: string, deliveryId: string): Promise<void> {
		return this.#service.retryDelivery(webhookId, deliveryId);
	}

	async getOrgAnalytics(options?: {
		start?: string;
		end?: string;
		granularity?: string;
	}): Promise<WebhookOrgAnalytics> {
		return this.#service.getOrgAnalytics(options);
	}

	async getOrgTimeSeries(options?: {
		start?: string;
		end?: string;
		granularity?: string;
	}): Promise<{
		period: { start: string; end: string; granularity?: string };
		series: Array<{ timestamp: string; received: number; delivered: number; failed: number }>;
	}> {
		return this.#service.getOrgTimeSeries(options);
	}
}
