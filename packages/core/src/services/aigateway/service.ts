import { z } from 'zod';
import { StructuredError } from '../../error.ts';
import { FetchAdapter } from '../adapter.ts';
import { buildUrl, toServiceException, toPayload } from '../_util.ts';

const AIGatewayModelsResponseError = StructuredError('AIGatewayModelsResponseError')<{
	error?: string;
	message?: string;
}>();

export const AIGatewayPricingSchema = z.object({
	input: z.number().describe('Input token price.'),
	output: z.number().describe('Output token price.'),
	cached_input: z.number().optional().describe('Cached input token price.'),
	unit: z.string().describe('Pricing unit.'),
	currency: z.string().describe('Pricing currency.'),
});

export type AIGatewayPricing = z.infer<typeof AIGatewayPricingSchema>;

export const AIGatewayModelProviderSchema = z.object({
	env: z.array(z.string()).optional().describe('Environment variables used by this provider.'),
	api: z.string().optional().describe('Provider API URL.'),
	doc: z.string().optional().describe('Provider documentation URL.'),
	logo_url: z.string().optional().describe('Provider logo URL.'),
});

export type AIGatewayModelProvider = z.infer<typeof AIGatewayModelProviderSchema>;

export const AIGatewayModelSchema = z.object({
	id: z.string().describe('Model identifier.'),
	name: z.string().describe('Display name.'),
	created: z.number().optional().describe('Unix timestamp when the model was created.'),
	api: z.string().optional().describe('Compatible provider API shape.'),
	family: z.string().optional().describe('Model family.'),
	context_window: z.number().optional().describe('Maximum context window.'),
	max_output_tokens: z.number().optional().describe('Maximum output token count.'),
	input_modalities: z.array(z.string()).optional().describe('Supported input modalities.'),
	output_modalities: z.array(z.string()).optional().describe('Supported output modalities.'),
	attachment: z.boolean().optional().describe('Whether the model supports attachments.'),
	reasoning: z.boolean().optional().describe('Whether the model supports reasoning.'),
	tool_call: z.boolean().optional().describe('Whether the model supports tool calls.'),
	temperature: z.boolean().optional().describe('Whether the model supports temperature.'),
	knowledge: z.string().optional().describe('Knowledge cutoff or label.'),
	open_weights: z.boolean().optional().describe('Whether the model has open weights.'),
	provider: AIGatewayModelProviderSchema.optional().describe('Provider metadata.'),
	pricing: AIGatewayPricingSchema.optional().describe('Model pricing.'),
});

export type AIGatewayModel = z.infer<typeof AIGatewayModelSchema>;

export const AIGatewayModelsSchema = z.record(z.string(), z.array(AIGatewayModelSchema));
export type AIGatewayModels = z.infer<typeof AIGatewayModelsSchema>;

export const AIGatewayModelsResponseSchema = z.object({
	success: z.boolean(),
	data: AIGatewayModelsSchema.optional(),
	message: z.string().optional(),
	error: z.string().optional(),
});

export type AIGatewayModelsResponse = z.infer<typeof AIGatewayModelsResponseSchema>;

export const AIGatewayChatMessageSchema = z.object({
	role: z.enum(['system', 'developer', 'user', 'assistant', 'tool']),
	content: z
		.union([
			z.string(),
			z.array(
				z
					.object({
						type: z.string(),
					})
					.catchall(z.unknown())
			),
			z.null(),
		])
		.optional(),
	name: z.string().optional(),
	tool_call_id: z.string().optional(),
	tool_calls: z.array(z.unknown()).optional(),
});

export type AIGatewayChatMessage = z.infer<typeof AIGatewayChatMessageSchema>;

export const AIGatewayChatCompletionParamsSchema = z
	.object({
		model: z.string().describe('Model to use for the completion.'),
		messages: z.array(AIGatewayChatMessageSchema).optional().describe('Messages to complete.'),
		prompt: z
			.union([z.string(), z.array(z.string())])
			.optional()
			.describe('Prompt to complete.'),
		temperature: z.number().optional(),
		top_p: z.number().optional(),
		max_tokens: z.number().optional(),
		stream: z.boolean().optional(),
		stop: z.union([z.string(), z.array(z.string())]).optional(),
	})
	.catchall(z.unknown());

export type AIGatewayChatCompletionParams = z.infer<typeof AIGatewayChatCompletionParamsSchema>;

export const AIGatewayChatCompletionSchema = z
	.object({
		id: z.string().optional(),
		object: z.string().optional(),
		created: z.number().optional(),
		model: z.string().optional(),
		choices: z.array(z.unknown()).optional(),
		usage: z.unknown().optional(),
		agentuity: z
			.object({
				headers: z
					.record(z.string(), z.string())
					.optional()
					.describe('AI Gateway response headers captured from the HTTP response.'),
				cost: z
					.object({
						total: z.number().optional().describe('Total estimated gateway cost in USD.'),
						promptTokens: z
							.number()
							.optional()
							.describe('Prompt token count used for gateway billing.'),
						completionTokens: z
							.number()
							.optional()
							.describe('Completion token count used for gateway billing.'),
					})
					.optional()
					.describe('Parsed AI Gateway cost information when available.'),
			})
			.optional()
			.describe('Agentuity AI Gateway metadata.'),
	})
	.catchall(z.unknown());

export type AIGatewayChatCompletion = z.infer<typeof AIGatewayChatCompletionSchema>;

export const AIGatewayResponseMetadataSchema = z.object({
	headers: z.record(z.string(), z.string()).optional(),
	cost: z
		.object({
			total: z.number().optional(),
			promptTokens: z.number().optional(),
			completionTokens: z.number().optional(),
		})
		.optional(),
});

export type AIGatewayResponseMetadata = z.infer<typeof AIGatewayResponseMetadataSchema>;

export type AIGatewayStreamingCompletion = {
	stream: ReadableStream<Uint8Array>;
	metadata: Promise<AIGatewayResponseMetadata>;
};

function parseNumber(value: string | undefined): number | undefined {
	if (value === undefined || value.trim() === '') {
		return undefined;
	}
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : undefined;
}

function extractGatewayMetadataFromHeaders(headers: Headers): AIGatewayResponseMetadata {
	const captured: Record<string, string> = {};
	for (const [key, value] of headers.entries()) {
		const lower = key.toLowerCase();
		if (
			lower.startsWith('x-gateway-') ||
			(lower.startsWith('x-agentuity-') &&
				(lower.includes('cost') || lower.includes('token') || lower.includes('usage')))
		) {
			captured[lower] = value;
		}
	}

	const total = parseNumber(captured['x-gateway-cost']);
	const promptTokens = parseNumber(captured['x-gateway-prompt-tokens']);
	const completionTokens = parseNumber(captured['x-gateway-completion-tokens']);
	const cost =
		total !== undefined || promptTokens !== undefined || completionTokens !== undefined
			? { total, promptTokens, completionTokens }
			: undefined;

	return {
		...(Object.keys(captured).length > 0 ? { headers: captured } : {}),
		...(cost ? { cost } : {}),
	};
}

async function extractGatewayMetadata(response: Response): Promise<AIGatewayResponseMetadata> {
	const metadata = extractGatewayMetadataFromHeaders(response.headers);
	const trailers = (response as Response & { trailers?: Promise<Headers> }).trailers;
	if (trailers) {
		try {
			const trailerMetadata = extractGatewayMetadataFromHeaders(await trailers);
			const cost =
				metadata.cost || trailerMetadata.cost
					? { ...(metadata.cost ?? {}), ...(trailerMetadata.cost ?? {}) }
					: undefined;
			return {
				headers: { ...metadata.headers, ...trailerMetadata.headers },
				...(cost ? { cost } : {}),
			};
		} catch {
			// Some runtimes expose a trailers promise but reject when trailers are unavailable.
		}
	}
	return metadata;
}

function attachGatewayMetadata<T extends Record<string, unknown>>(
	payload: T,
	metadata: AIGatewayResponseMetadata
): T {
	if (!metadata.headers && !metadata.cost) {
		return payload;
	}
	return {
		...payload,
		agentuity: {
			...(typeof payload.agentuity === 'object' && payload.agentuity !== null
				? payload.agentuity
				: {}),
			...metadata,
		},
	};
}

export class AIGatewayService {
	constructor(
		readonly baseUrl: string,
		readonly adapter: FetchAdapter
	) {}

	async listModels(): Promise<AIGatewayModels> {
		const method = 'GET';
		const url = buildUrl(this.baseUrl, '/models');
		const response = await this.adapter.invoke<AIGatewayModelsResponse>(url, {
			method,
			telemetry: { name: 'aigateway.models.list' },
		});
		if (!response.ok) {
			throw await toServiceException(method, url, response.response);
		}
		const payload = AIGatewayModelsResponseSchema.parse(response.data);
		if (!payload.success) {
			throw new AIGatewayModelsResponseError({
				message: payload.error || payload.message || 'AI Gateway failed to list models',
				error: payload.error,
			});
		}
		if (!payload.data) {
			throw new AIGatewayModelsResponseError({
				message: 'AI Gateway model response did not include data',
			});
		}
		return payload.data;
	}

	async complete(params: AIGatewayChatCompletionParams): Promise<AIGatewayChatCompletion> {
		const method = 'POST';
		const url = buildUrl(this.baseUrl, '/');
		const [body, contentType] = await toPayload(
			AIGatewayChatCompletionParamsSchema.parse(params)
		);
		const response = await this.adapter.invoke<AIGatewayChatCompletion>(url, {
			method,
			body,
			contentType,
			telemetry: { name: 'aigateway.completions.create' },
		});
		if (!response.ok) {
			throw await toServiceException(method, url, response.response);
		}
		const payload = attachGatewayMetadata(
			response.data as Record<string, unknown>,
			await extractGatewayMetadata(response.response)
		);
		return AIGatewayChatCompletionSchema.parse(payload);
	}

	async streamComplete(
		params: AIGatewayChatCompletionParams
	): Promise<ReadableStream<Uint8Array>> {
		return (await this.streamCompleteWithMetadata(params)).stream;
	}

	async streamCompleteWithMetadata(
		params: AIGatewayChatCompletionParams
	): Promise<AIGatewayStreamingCompletion> {
		const method = 'POST';
		const url = buildUrl(this.baseUrl, '/');
		const [body, contentType] = await toPayload(
			AIGatewayChatCompletionParamsSchema.parse({ ...params, stream: true })
		);
		const response = await this.adapter.invoke<never>(url, {
			method,
			body,
			contentType,
			headers: { Accept: 'text/event-stream' },
			binary: true,
			telemetry: { name: 'aigateway.completions.stream' },
		});
		if (!response.ok) {
			throw await toServiceException(method, url, response.response);
		}
		if (!response.response.body) {
			throw await toServiceException(
				method,
				url,
				new Response('Streaming response did not include a body', { status: 502 })
			);
		}
		return {
			stream: response.response.body,
			metadata: extractGatewayMetadata(response.response),
		};
	}
}
