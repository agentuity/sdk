export {
	ScheduleService,
	type Schedule,
	type ScheduleDestination,
	type ScheduleDelivery,
	type CreateScheduleParams,
	type UpdateScheduleParams,
	type CreateScheduleDestinationParams,
	type ScheduleListResult,
	type ScheduleGetResult,
	type ScheduleCreateResult,
	type ScheduleDeliveryListResult,
	ScheduleSchema,
	ScheduleDestinationSchema,
	ScheduleDeliverySchema,
	CreateScheduleParamsSchema,
	UpdateScheduleParamsSchema,
	CreateScheduleDestinationParamsSchema,
	ScheduleListResultSchema,
	ScheduleGetResultSchema,
	ScheduleCreateResultSchema,
	ScheduleDeliveryListResultSchema,
} from '@agentuity/core/schedule';

import {
	ScheduleService,
	type CreateScheduleParams,
	type UpdateScheduleParams,
	type CreateScheduleDestinationParams,
	type ScheduleGetResult,
	type ScheduleListResult,
	type ScheduleCreateResult,
	type ScheduleDeliveryListResult,
	type Schedule,
	type ScheduleDestination,
} from '@agentuity/core/schedule';
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

export const ScheduleClientOptionsSchema = z.object({
	apiKey: z.string().optional().describe('API key for authentication'),
	url: z.string().optional().describe('Base URL for the Schedule API'),
	orgId: z.string().optional().describe('Organization ID for multi-tenant operations'),
	logger: z.custom<Logger>(isLogger).optional().describe('Custom logger instance'),
});
export type ScheduleClientOptions = z.infer<typeof ScheduleClientOptionsSchema>;

export class ScheduleClient {
	readonly #service: ScheduleService;

	constructor(options: ScheduleClientOptions = {}) {
		const validatedOptions = ScheduleClientOptionsSchema.parse(options);
		const serviceUrls = getServiceUrls(resolveRegion());
		const url = resolveServiceUrl({
			url: validatedOptions.url,
			envKey: 'AGENTUITY_SCHEDULE_URL',
			fallback: serviceUrls.catalyst,
		});
		const { adapter } = createServiceAdapter({
			apiKey: resolveApiKey(validatedOptions.apiKey),
			orgId: validatedOptions.orgId,
			logger: validatedOptions.logger,
		});
		this.#service = new ScheduleService(url, adapter);
	}

	async create(params: CreateScheduleParams): Promise<ScheduleCreateResult> {
		return this.#service.create(params);
	}

	async list(params?: { limit?: number; offset?: number }): Promise<ScheduleListResult> {
		return this.#service.list(params);
	}

	async get(scheduleId: string): Promise<ScheduleGetResult> {
		return this.#service.get(scheduleId);
	}

	async update(scheduleId: string, params: UpdateScheduleParams): Promise<{ schedule: Schedule }> {
		return this.#service.update(scheduleId, params);
	}

	async delete(scheduleId: string): Promise<void> {
		return this.#service.delete(scheduleId);
	}

	async createDestination(
		scheduleId: string,
		params: CreateScheduleDestinationParams
	): Promise<{ destination: ScheduleDestination }> {
		return this.#service.createDestination(scheduleId, params);
	}

	async deleteDestination(destinationId: string): Promise<void> {
		return this.#service.deleteDestination(destinationId);
	}

	async listDeliveries(
		scheduleId: string,
		params?: { limit?: number; offset?: number }
	): Promise<ScheduleDeliveryListResult> {
		return this.#service.listDeliveries(scheduleId, params);
	}
}
