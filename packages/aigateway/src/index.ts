export {
	AIGatewayService,
	applyAIGatewayResponseSchema,
	buildAIGatewayCompletionParams,
	getAIGatewayCompletionStructured,
	getAIGatewayCompletionText,
	getAIGatewayCompletionTextResult,
	getAIGatewayProviderFamily,
	type AIGatewayChatCompletion,
	type AIGatewayChatCompletionParams,
	type AIGatewayChatMessage,
	type AIGatewayCompletionAdapterRequest,
	type AIGatewayCompletionTextReason,
	type AIGatewayCompletionTextResult,
	type AIGatewayModel,
	type AIGatewayModelProvider,
	type AIGatewayModels,
	type AIGatewayModelsResponse,
	type AIGatewayPricing,
	type AIGatewayProviderFamily,
	type AIGatewayRequestOptions,
	type AIGatewayRequestResponse,
	type AIGatewayReasoning,
	type AIGatewayResponseMetadata,
	type AIGatewayResponseSchemaInput,
	type AIGatewayStreamingCompletion,
	AIGatewayChatCompletionParamsSchema,
	AIGatewayChatCompletionSchema,
	AIGatewayChatMessageSchema,
	AIGatewayModelProviderSchema,
	AIGatewayModelSchema,
	AIGatewayModelsResponseSchema,
	AIGatewayModelsSchema,
	AIGatewayPricingSchema,
	AIGatewayResponseSchemaSchema,
} from '@agentuity/core/aigateway';

import {
	AIGatewayService,
	applyAIGatewayResponseSchema,
	getAIGatewayCompletionStructured,
	getAIGatewayCompletionTextResult,
	type AIGatewayChatCompletion,
	type AIGatewayChatCompletionParams,
	type AIGatewayCompletionTextResult,
	type AIGatewayModels,
	type AIGatewayProviderFamily,
	type AIGatewayRequestOptions,
	type AIGatewayRequestResponse,
	type AIGatewayResponseSchemaInput,
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

	/**
	 * Run a completion and return the assistant's textual reply directly, normalized across
	 * provider response shapes. Returns the raw `completion` alongside so callers don't lose
	 * usage/metadata.
	 *
	 * The `text` field is the concatenated assistant text. `hasText` distinguishes "the model
	 * returned no textual content" (e.g. it stopped on `tool_calls` or hit `length`) from
	 * "the model returned an empty string".
	 */
	async completeText(
		params: AIGatewayChatCompletionParams
	): Promise<AIGatewayCompletionTextResult & { completion: AIGatewayChatCompletion }> {
		const completion = await this.#service.complete(params);
		const result = getAIGatewayCompletionTextResult(completion);
		return { ...result, completion };
	}

	/**
	 * Run a structured-output completion: the gateway translates `response_schema` (or the
	 * `response_schema` field on `params`) into the right provider-native structured-output
	 * primitive, and the parsed JSON payload is returned in the `data` field. The raw
	 * `completion` is included so callers can still inspect usage / cost / finish reason.
	 *
	 * `data` is typed as the caller-supplied generic. The runtime guarantee is only "the
	 * provider returned JSON that parsed" — pass a Zod / StandardSchema schema and call
	 * `safeParse` on the result if you want validated narrowing.
	 */
	async completeStructured<T = unknown>(
		params: AIGatewayChatCompletionParams & { response_schema: AIGatewayResponseSchemaInput }
	): Promise<{
		data: T | undefined;
		completion: AIGatewayChatCompletion;
		family: AIGatewayProviderFamily;
	}> {
		const { family } = applyAIGatewayResponseSchema(params);
		const completion = await this.#service.complete(params);
		const data = getAIGatewayCompletionStructured(completion, family) as T | undefined;
		return { data, completion, family };
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
