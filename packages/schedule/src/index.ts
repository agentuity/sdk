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
import { createServerFetchAdapter, type Logger } from '@agentuity/server';
import { createMinimalLogger } from '@agentuity/core';
import { getEnv } from '@agentuity/core';
import { getServiceUrls } from '@agentuity/core/config';
import { z } from 'zod';

export const ScheduleClientOptionsSchema = z.object({
	apiKey: z.string().optional().describe('API key for authentication'),
	url: z.string().optional().describe('Base URL for the Schedule API'),
	orgId: z.string().optional().describe('Organization ID for multi-tenant operations'),
	logger: z.custom<Logger>().optional().describe('Custom logger instance'),
});
export type ScheduleClientOptions = z.infer<typeof ScheduleClientOptionsSchema>;

export class ScheduleClient {
	readonly #service: ScheduleService;
	readonly #orgId?: string;

	constructor(options: ScheduleClientOptions = {}) {
		const apiKey = options.apiKey || getEnv('AGENTUITY_SDK_KEY') || getEnv('AGENTUITY_CLI_KEY');
		const region = getEnv('AGENTUITY_REGION') ?? 'usc';
		const serviceUrls = getServiceUrls(region);

		const url = options.url || getEnv('AGENTUITY_SCHEDULE_URL') || serviceUrls.catalyst;

		const logger = options.logger ?? createMinimalLogger();

		this.#orgId = options.orgId;

		const adapter = createServerFetchAdapter(
			{
				headers: apiKey
					? {
							Authorization: `Bearer ${apiKey}`,
							'Content-Type': 'application/json',
						}
					: { 'Content-Type': 'application/json' },
			},
			logger
		);
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
