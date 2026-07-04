export * from './service.ts';
export * from './protocol.ts';
export * from './websocket.ts';

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
} from './service.ts';
import { getEnv, getServiceUrls } from '@agentuity/config';
import {
	createServiceAdapter,
	isLogger,
	resolveApiKey,
	resolveRegion,
	resolveServiceUrl,
	type Logger,
} from '@agentuity/client';
import { isCliApiKey } from './protocol.ts';
import {
	createAIGatewayWebSocketClient,
	type AIGatewayWebSocketClient,
	type AIGatewayWebSocketOptions,
} from './websocket.ts';
import { z } from 'zod';

function normalizeOrgId(orgId: string | undefined): string | undefined {
	const trimmed = orgId?.trim();
	return trimmed ? trimmed : undefined;
}

function resolveOrgId(orgId: string | undefined): string | undefined {
	return (
		normalizeOrgId(orgId) ??
		normalizeOrgId(getEnv('AGENTUITY_ORGID')) ??
		normalizeOrgId(getEnv('AGENTUITY_ORG_ID')) ??
		normalizeOrgId(getEnv('AGENTUITY_CLOUD_ORG_ID'))
	);
}

export const AIGatewayClientOptionsSchema = z.object({
	apiKey: z.string().optional().describe('API key for authentication'),
	url: z.string().optional().describe('Base URL for the AI Gateway API'),
	orgId: z.string().optional().describe('Organization ID for multi-tenant operations'),
	logger: z.custom<Logger>(isLogger).optional().describe('Custom logger instance'),
});

export type AIGatewayClientOptions = z.infer<typeof AIGatewayClientOptionsSchema>;

export class AIGatewayClient {
	readonly #service: AIGatewayService;
	readonly #apiKey: string;
	readonly #orgId: string | undefined;
	readonly #url: string;

	constructor(options: AIGatewayClientOptions = {}) {
		const validatedOptions = AIGatewayClientOptionsSchema.parse(options);
		const apiKey =
			validatedOptions.apiKey || getEnv('AGENTUITY_AIGATEWAY_KEY') || resolveApiKey() || '';
		const serviceUrls = getServiceUrls(resolveRegion());
		const url = resolveServiceUrl({
			url: validatedOptions.url,
			envKey: 'AGENTUITY_AIGATEWAY_URL',
			fallback: serviceUrls.aigateway,
		});
		const orgId = resolveOrgId(validatedOptions.orgId);
		const { adapter } = createServiceAdapter({
			apiKey,
			orgId,
			logger: validatedOptions.logger,
		});
		this.#apiKey = apiKey;
		this.#orgId = orgId;
		this.#url = url;
		this.#service = new AIGatewayService(url, adapter);
	}

	createWebSocket(
		options: Omit<AIGatewayWebSocketOptions, 'apiKey' | 'orgId' | 'url'> & {
			url?: string;
		} = {}
	): AIGatewayWebSocketClient {
		if (!this.#apiKey) {
			throw new Error(
				'API key is required for AI Gateway WebSocket connections. Provide apiKey when constructing AIGatewayClient or set AGENTUITY_AIGATEWAY_KEY / AGENTUITY_SDK_KEY.'
			);
		}
		if (isCliApiKey(this.#apiKey) && !this.#orgId) {
			throw new Error(
				'Organization ID is required for AI Gateway WebSocket connections when using a CLI API key (ck_*). Provide orgId when constructing AIGatewayClient or set AGENTUITY_ORGID / AGENTUITY_ORG_ID / AGENTUITY_CLOUD_ORG_ID.'
			);
		}
		return createAIGatewayWebSocketClient({
			apiKey: this.#apiKey,
			orgId: this.#orgId,
			...options,
			url: options.url ?? this.#url,
		});
	}

	async listModels(): Promise<AIGatewayModels> {
		return this.#service.listModels();
	}

	async complete(params: AIGatewayChatCompletionParams): Promise<AIGatewayChatCompletion> {
		return this.#service.complete(params);
	}

	async completeText(
		params: AIGatewayChatCompletionParams
	): Promise<AIGatewayCompletionTextResult & { completion: AIGatewayChatCompletion }> {
		const completion = await this.#service.complete(params);
		const result = getAIGatewayCompletionTextResult(completion);
		return { ...result, completion };
	}

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
