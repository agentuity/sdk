export {
	AIGatewayService,
	buildAIGatewayCompletionParams,
	type AIGatewayChatCompletion,
	type AIGatewayChatCompletionParams,
	type AIGatewayChatMessage,
	type AIGatewayCompletionAdapterRequest,
	type AIGatewayModel,
	type AIGatewayModelProvider,
	type AIGatewayModels,
	type AIGatewayModelsResponse,
	type AIGatewayPricing,
	type AIGatewayReasoning,
	AIGatewayChatCompletionParamsSchema,
	AIGatewayChatCompletionSchema,
	AIGatewayChatMessageSchema,
	AIGatewayModelProviderSchema,
	AIGatewayModelSchema,
	AIGatewayModelsResponseSchema,
	AIGatewayModelsSchema,
	AIGatewayPricingSchema,
} from '@agentuity/core/aigateway';

import {
	AIGatewayService,
	type AIGatewayChatCompletion,
	type AIGatewayChatCompletionParams,
	type AIGatewayModels,
} from '@agentuity/core/aigateway';
import { createMinimalLogger, getEnv } from '@agentuity/core';
import { getServiceUrls } from '@agentuity/core/config';
import { buildClientHeaders, createServerFetchAdapter, type Logger } from '@agentuity/server';
import { z } from 'zod';

const isLogger = (val: unknown): val is Logger =>
	typeof val === 'object' &&
	val !== null &&
	['info', 'warn', 'error', 'debug', 'trace'].every(
		(m) => typeof (val as Record<string, unknown>)[m] === 'function'
	);

export const AIGatewayClientOptionsSchema = z.object({
	apiKey: z.string().optional().describe('API key for authentication'),
	url: z.string().optional().describe('Base URL for the AI Gateway API'),
	orgId: z.string().optional().describe('Organization ID for multi-tenant operations'),
	logger: z.custom<Logger>(isLogger).optional().describe('Custom logger instance'),
});

export type AIGatewayClientOptions = z.infer<typeof AIGatewayClientOptionsSchema>;

export class AIGatewayClient {
	readonly #service: AIGatewayService;

	constructor(options: AIGatewayClientOptions = {}) {
		const validatedOptions = AIGatewayClientOptionsSchema.parse(options);
		const apiKey =
			validatedOptions.apiKey ||
			getEnv('AGENTUITY_AIGATEWAY_KEY') ||
			getEnv('AGENTUITY_SDK_KEY') ||
			getEnv('AGENTUITY_CLI_KEY');
		const region = getEnv('AGENTUITY_REGION') ?? 'usc';
		const serviceUrls = getServiceUrls(region);
		const url =
			validatedOptions.url || getEnv('AGENTUITY_AIGATEWAY_URL') || serviceUrls.aigateway;
		const logger = validatedOptions.logger ?? createMinimalLogger();
		const headers = buildClientHeaders({
			apiKey,
			orgId: validatedOptions.orgId,
		});

		const adapter = createServerFetchAdapter({ headers }, logger);
		this.#service = new AIGatewayService(url, adapter);
	}

	async listModels(): Promise<AIGatewayModels> {
		return this.#service.listModels();
	}

	async complete(params: AIGatewayChatCompletionParams): Promise<AIGatewayChatCompletion> {
		return this.#service.complete(params);
	}
}
