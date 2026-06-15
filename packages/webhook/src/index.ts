export * from './service.ts';

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
} from './service.ts';
import type { WebhookOrgAnalytics, WebhookReceipt } from './types.ts';
import { getServiceUrls } from '@agentuity/config';
import {
	createServiceAdapter,
	isLogger,
	resolveApiKey,
	resolveRegion,
	resolveServiceUrl,
	type Logger,
} from '@agentuity/client';
import { z } from 'zod';

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
		const serviceUrls = getServiceUrls(resolveRegion());
		const url = resolveServiceUrl({
			url: validatedOptions.url,
			envKey: 'AGENTUITY_WEBHOOK_URL',
			fallback: serviceUrls.catalyst,
		});
		const { adapter } = createServiceAdapter({
			apiKey: resolveApiKey(validatedOptions.apiKey),
			orgId: validatedOptions.orgId,
			logger: validatedOptions.logger,
		});
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
