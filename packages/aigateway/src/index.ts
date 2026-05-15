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
	type AIGatewayRequestOptions,
	type AIGatewayRequestResponse,
	type AIGatewayReasoning,
	type AIGatewayResponseMetadata,
	type AIGatewayStreamingCompletion,
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
	type AIGatewayRequestOptions,
	type AIGatewayRequestResponse,
	type AIGatewayStreamingCompletion,
} from '@agentuity/core/aigateway';
import { createMinimalLogger, getEnv, type Logger } from '@agentuity/core';
import { getServiceUrls } from '@agentuity/core/config';
import { buildClientHeaders, createServerFetchAdapter } from '@agentuity/adapter';
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

	async request<T = unknown>(
		options: AIGatewayRequestOptions
	): Promise<AIGatewayRequestResponse<T>> {
		return this.#service.request<T>(options);
	}

	async streamRequest(options: AIGatewayRequestOptions): Promise<AIGatewayStreamingCompletion> {
		return this.#service.streamRequest(options);
	}
}
