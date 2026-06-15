import { buildUrl, toPayload, toServiceException } from '@agentuity/adapter';
import type { FetchAdapter } from '@agentuity/adapter';
import { StructuredError } from '@agentuity/adapter';
import { z } from 'zod';

const AIGatewayModelsResponseError = StructuredError('AIGatewayModelsResponseError')<{
	error?: string;
	message?: string;
}>();

const AIGatewayResponseSchemaError = StructuredError('AIGatewayResponseSchemaError')<{
	reason: 'conversion_failed' | 'invalid_input';
	message: string;
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
	recommended: z.boolean().optional().describe('Whether this model is recommended.'),
	default_for: z.array(z.string()).optional().describe('Default use cases for this model.'),
	rank: z.number().optional().describe('Recommendation rank; lower values are preferred.'),
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

export type AIGatewayReasoning = 'off' | 'low' | 'medium' | 'high' | '1024' | '4096' | '8192';

export interface AIGatewayCompletionAdapterRequest {
	api?: string;
	maxTokens?: number;
	messages: AIGatewayChatMessage[];
	model: string;
	reasoning?: AIGatewayReasoning;
	systemPrompt?: string;
}

const missingCompletionInputMessage = 'contents, input, prompt, or messages must be provided';

function hasCompletionInput(params: {
	contents?: unknown[];
	input?: unknown;
	prompt?: string | string[];
	messages?: unknown[];
}): boolean {
	if (params.contents && params.contents.length > 0) {
		return true;
	}
	if (params.messages && params.messages.length > 0) {
		return true;
	}
	if (typeof params.prompt === 'string') {
		return params.prompt.trim().length > 0;
	}
	if (Array.isArray(params.prompt)) {
		return params.prompt.length > 0 && params.prompt.every((item) => item.trim().length > 0);
	}
	if (typeof params.input === 'string') {
		return params.input.trim().length > 0;
	}
	if (Array.isArray(params.input)) {
		return params.input.length > 0;
	}
	if (params.input && typeof params.input === 'object') {
		return true;
	}
	return false;
}

const StandardSchemaCustom = z.custom<{ '~standard': unknown }>(
	(value) =>
		typeof value === 'object' &&
		value !== null &&
		(Object.hasOwn(value, '~standard') || '~standard' in value),
	{ message: 'expected a StandardSchema-compliant value (must expose a `~standard` property)' }
);

export const AIGatewayResponseSchemaSchema = z
	.object({
		name: z
			.string()
			.optional()
			.describe(
				'Schema name. Used by providers that require a named JSON Schema (default: "response").'
			),
		description: z.string().optional().describe('Schema description; surfaced to the model.'),
		strict: z
			.boolean()
			.optional()
			.describe('Whether the provider should enforce strict adherence (default: true).'),
		schema: z
			.union([z.record(z.string(), z.unknown()), StandardSchemaCustom])
			.describe(
				'JSON Schema describing the desired response shape, or a StandardSchema/Zod schema. Translated to the provider-native structured-output primitive at request time.'
			),
	})
	.describe('Structured-output schema. See `response_schema` on AIGatewayChatCompletionParams.');

export const AIGatewayChatCompletionParamsSchema = z
	.object({
		model: z.string().describe('Model to use for the completion.'),
		input: z
			.unknown()
			.optional()
			.describe('Responses-compatible input payload for models using the Responses API.'),
		contents: z.array(z.unknown()).optional().describe('Google Generative AI contents payload.'),
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
		response_format: z
			.unknown()
			.optional()
			.describe(
				'OpenAI-style `response_format` passed through to OpenAI-compatible providers. Prefer `response_schema` for provider-agnostic structured output.'
			),
		response_schema: z
			.union([
				AIGatewayResponseSchemaSchema,
				z.record(z.string(), z.unknown()),
				StandardSchemaCustom,
			])
			.optional()
			.describe(
				'Provider-agnostic structured-output schema (JSON Schema, StandardSchema v1, or Zod). At request time the gateway translates this to the right provider-native primitive: OpenAI `response_format: { type: "json_schema" }`, Anthropic `submit_response` tool with forced `tool_choice`, Google `generationConfig.responseSchema`, or schema-injected prompt fallback for unknown models.'
			),
	})
	.catchall(z.unknown())
	.superRefine((params, ctx) => {
		if (!hasCompletionInput(params)) {
			ctx.addIssue({
				code: 'custom',
				message: missingCompletionInputMessage,
				path: [],
			});
		}
	});

export type AIGatewayChatCompletionParams = z.infer<typeof AIGatewayChatCompletionParamsSchema>;

function withSystemMessage(
	messages: AIGatewayChatMessage[],
	systemPrompt?: string
): AIGatewayChatMessage[] {
	if (!systemPrompt) return messages;

	return [{ role: 'system', content: systemPrompt }, ...messages];
}

function toResponsesInput(messages: AIGatewayChatMessage[], systemPrompt?: string) {
	return withSystemMessage(messages, systemPrompt).map((message) => ({
		...message,
		role: message.role === 'system' ? 'developer' : message.role,
	}));
}

function toGoogleRole(role: AIGatewayChatMessage['role']): 'model' | 'user' {
	return role === 'assistant' ? 'model' : 'user';
}

function toGoogleContents(messages: AIGatewayChatMessage[]) {
	return messages.map((message) => ({
		role: toGoogleRole(message.role),
		parts: [{ text: typeof message.content === 'string' ? message.content : '' }],
	}));
}

function toGoogleSystemInstruction(systemPrompt?: string) {
	return systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined;
}

function getMaxTokensParam(model: string, maxTokens?: number): Record<string, number> {
	if (!maxTokens) return {};

	if (/^openai\/gpt-5(?:[.-]|$)/.test(model)) {
		return { max_completion_tokens: maxTokens };
	}

	return { max_tokens: maxTokens };
}

function getMaxOutputTokensParam(maxTokens?: number): Record<string, number> {
	return maxTokens ? { max_output_tokens: maxTokens } : {};
}

function getOpenAIReasoningEffort(
	reasoning?: AIGatewayReasoning
): 'high' | 'low' | 'medium' | undefined {
	if (reasoning === 'low' || reasoning === 'medium' || reasoning === 'high') {
		return reasoning;
	}

	return undefined;
}

function getReasoningBudget(reasoning?: AIGatewayReasoning): number | undefined {
	const reasoningBudget = Number(reasoning);

	return Number.isFinite(reasoningBudget) && reasoningBudget > 0 ? reasoningBudget : undefined;
}

function getGoogleThinkingLevel(
	reasoning?: AIGatewayReasoning
): 'HIGH' | 'MEDIUM' | 'MINIMAL' | undefined {
	switch (reasoning) {
		case 'low':
			return 'MINIMAL';
		case 'medium':
			return 'MEDIUM';
		case 'high':
			return 'HIGH';
		default:
			return undefined;
	}
}

function getGoogleThinkingConfig(reasoning?: AIGatewayReasoning) {
	const reasoningBudget = getReasoningBudget(reasoning);
	if (reasoningBudget) {
		return { thinkingBudget: reasoningBudget };
	}

	const thinkingLevel = getGoogleThinkingLevel(reasoning);
	return thinkingLevel ? { thinkingLevel } : undefined;
}

function isDeepSeekModel(model: string): boolean {
	return model === 'deepseek' || model.startsWith('deepseek/');
}

function getDeepSeekThinkingParams(
	model: string,
	reasoning: AIGatewayReasoning
): Record<string, unknown> {
	if (!isDeepSeekModel(model)) return {};

	const reasoningEffort = getOpenAIReasoningEffort(reasoning);
	if (!reasoningEffort) {
		return { thinking: { type: 'disabled' } };
	}

	return {
		reasoning_effort: reasoningEffort,
		thinking: { type: 'enabled' },
	};
}

export function buildAIGatewayCompletionParams({
	api,
	maxTokens,
	messages,
	model,
	reasoning = 'off',
	systemPrompt,
}: AIGatewayCompletionAdapterRequest): AIGatewayChatCompletionParams {
	const reasoningEffort = getOpenAIReasoningEffort(reasoning);
	const reasoningBudget = getReasoningBudget(reasoning);
	const googleThinkingConfig = getGoogleThinkingConfig(reasoning);

	switch (api) {
		case 'openai-responses':
		case 'openai-codex-responses':
			return {
				model,
				input: toResponsesInput(messages, systemPrompt),
				...(reasoningEffort
					? { reasoning: { effort: reasoningEffort, summary: 'detailed' } }
					: {}),
				...getMaxOutputTokensParam(maxTokens),
			};
		case 'anthropic-messages':
			return {
				model,
				messages,
				...(systemPrompt ? { system: systemPrompt } : {}),
				...(reasoningBudget
					? { thinking: { budget_tokens: reasoningBudget, type: 'enabled' } }
					: {}),
				...getMaxTokensParam(model, maxTokens),
			};
		case 'google-generative-ai':
			return {
				model,
				contents: toGoogleContents(messages),
				...(systemPrompt ? { systemInstruction: toGoogleSystemInstruction(systemPrompt) } : {}),
				generationConfig: {
					...(maxTokens ? { maxOutputTokens: maxTokens } : {}),
					...(googleThinkingConfig ? { thinkingConfig: googleThinkingConfig } : {}),
				},
			};
		default:
			return {
				model,
				messages: withSystemMessage(messages, systemPrompt),
				...getDeepSeekThinkingParams(model, reasoning),
				...getMaxTokensParam(model, maxTokens),
			};
	}
}

export type AIGatewayResponseSchemaInput =
	| z.infer<typeof AIGatewayResponseSchemaSchema>
	| Record<string, unknown>
	| { '~standard': unknown };

export type AIGatewayProviderFamily = 'openai' | 'anthropic' | 'google' | 'unknown';

/**
 * Identify which provider family a model id maps to. Used to translate `response_schema`
 * into the right native structured-output primitive at request time.
 *
 * Recognises both the canonical `provider/model` form (e.g. `openai/gpt-4.1-mini`) and bare
 * model ids whose prefix unambiguously identifies a family (`gpt-`, `o1`/`o3`, `claude-`,
 * `gemini-`). Unknown ids fall through to schema-injected prompt fallback.
 */
export function getAIGatewayProviderFamily(model: string): AIGatewayProviderFamily {
	const lower = model.toLowerCase();
	if (lower.startsWith('openai/') || /^(gpt-|o[0-9])/.test(lower)) return 'openai';
	if (lower.startsWith('anthropic/') || lower.startsWith('claude-') || lower.startsWith('claude/'))
		return 'anthropic';
	if (lower.startsWith('google/') || lower.startsWith('gemini-') || lower.startsWith('gemini/'))
		return 'google';
	return 'unknown';
}

function isStandardSchema(value: unknown): value is { '~standard': unknown } {
	return (
		typeof value === 'object' &&
		value !== null &&
		(Object.hasOwn(value, '~standard') || '~standard' in value)
	);
}

function isPlainJsonSchema(value: unknown): value is Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	// Reject Schema-typed instances (they carry `~standard` as an own / prototype property).
	// A JSON Schema object that was produced *from* a Schema has no own `~standard` property.
	return !Object.hasOwn(value, '~standard');
}

function normalizeResponseSchemaInput(input: AIGatewayResponseSchemaInput): {
	name: string;
	description?: string;
	strict: boolean;
	schema: Record<string, unknown>;
} {
	// Wrapped form: { name?, description?, strict?, schema }
	if (
		typeof input === 'object' &&
		input !== null &&
		'schema' in input &&
		!isStandardSchema(input)
	) {
		const wrapped = input as z.infer<typeof AIGatewayResponseSchemaSchema>;
		return {
			name: wrapped.name ?? 'response',
			...(wrapped.description ? { description: wrapped.description } : {}),
			strict: wrapped.strict ?? true,
			schema: toPlainJsonSchema(wrapped.schema),
		};
	}
	return {
		name: 'response',
		strict: true,
		schema: toPlainJsonSchema(input),
	};
}

function toPlainJsonSchema(value: unknown): Record<string, unknown> {
	if (isStandardSchema(value)) {
		const converted = standardSchemaToJsonSchema(value);
		if (converted) return converted;
		throw new AIGatewayResponseSchemaError({
			reason: 'conversion_failed',
			message:
				'response_schema: could not convert the provided Schema to JSON Schema. Pass a JSON Schema object instead.',
		});
	}
	if (isPlainJsonSchema(value)) return value;
	throw new AIGatewayResponseSchemaError({
		reason: 'invalid_input',
		message:
			'response_schema: expected a JSON Schema object, a Zod schema, or { schema, ... } wrapper.',
	});
}

function standardSchemaToJsonSchema(value: unknown): Record<string, unknown> | undefined {
	// Zod v4 exposes `.toJSONSchema()` on schema instances, and a `z.toJSONSchema()` static helper.
	const instanceMethod = (value as { toJSONSchema?: () => unknown }).toJSONSchema;
	if (typeof instanceMethod === 'function') {
		const converted = instanceMethod.call(value);
		if (converted && typeof converted === 'object' && !Array.isArray(converted)) {
			return converted as Record<string, unknown>;
		}
	}
	try {
		const converted = z.toJSONSchema(value as unknown as z.ZodType, { target: 'draft-7' });
		if (converted && typeof converted === 'object' && !Array.isArray(converted)) {
			return converted as Record<string, unknown>;
		}
	} catch {
		// Schema is not a Zod schema.
	}
	return undefined;
}

/**
 * Inject `additionalProperties: false` recursively across object schemas. OpenAI and Google
 * both reject strict structured-output schemas that don't already say so explicitly.
 */
function enforceStrictJsonSchema(schema: unknown): unknown {
	if (Array.isArray(schema)) return schema.map(enforceStrictJsonSchema);
	if (!schema || typeof schema !== 'object') return schema;
	const record = schema as Record<string, unknown>;
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(record)) {
		out[k] = enforceStrictJsonSchema(v);
	}
	if (out.type === 'object' && out.additionalProperties === undefined) {
		out.additionalProperties = false;
	}
	return out;
}

function buildSchemaInstruction(
	name: string,
	description: string | undefined,
	schema: Record<string, unknown>
): string {
	const preamble = [
		'Respond with JSON that validates against the schema below.',
		description,
		'Output JSON only, no prose, no code fences.',
	]
		.filter(Boolean)
		.join(' ');
	return `${preamble}\n\nSchema name: ${name}\n\n${JSON.stringify(schema, null, 2)}`;
}

function prependSystemMessage(
	messages: AIGatewayChatMessage[] | undefined,
	text: string
): AIGatewayChatMessage[] {
	const base = messages ?? [];
	if (base.length > 0 && base[0]?.role === 'system') {
		const first = base[0];
		const existing = typeof first.content === 'string' ? first.content : '';
		return [{ ...first, content: existing ? `${existing}\n\n${text}` : text }, ...base.slice(1)];
	}
	return [{ role: 'system', content: text }, ...base];
}

/**
 * Translate a `response_schema` request param into the provider-native structured-output
 * primitive for the target model. Returns the rewritten params (with `response_schema`
 * removed) and the resolved `family` so callers can attach a parser that matches the
 * provider response shape.
 *
 * For models with no native support, the schema is injected into a system message and the
 * caller is responsible for JSON-parsing the textual reply (fallback path).
 */
export function applyAIGatewayResponseSchema(params: AIGatewayChatCompletionParams): {
	params: AIGatewayChatCompletionParams;
	family: AIGatewayProviderFamily;
	applied: boolean;
} {
	const { response_schema, ...rest } = params as AIGatewayChatCompletionParams & {
		response_schema?: AIGatewayResponseSchemaInput;
	};
	if (response_schema === undefined) {
		return { params, family: getAIGatewayProviderFamily(params.model), applied: false };
	}

	const normalized = normalizeResponseSchemaInput(response_schema);
	const family = getAIGatewayProviderFamily(params.model);
	const strictSchema = normalized.strict
		? (enforceStrictJsonSchema(normalized.schema) as Record<string, unknown>)
		: normalized.schema;

	switch (family) {
		case 'openai': {
			return {
				params: {
					...rest,
					response_format: {
						type: 'json_schema',
						json_schema: {
							name: normalized.name,
							...(normalized.description ? { description: normalized.description } : {}),
							strict: normalized.strict,
							schema: strictSchema,
						},
					},
				},
				family,
				applied: true,
			};
		}
		case 'anthropic': {
			// Anthropic's structured-output pattern is a forced tool call whose input_schema is the
			// caller's schema; the model's reply lives in the tool_use block's `input` field.
			const toolName = normalized.name;
			return {
				params: {
					...rest,
					tools: [
						{
							name: toolName,
							...(normalized.description ? { description: normalized.description } : {}),
							input_schema: strictSchema,
						},
					],
					tool_choice: { type: 'tool', name: toolName },
				},
				family,
				applied: true,
			};
		}
		case 'google': {
			const existing =
				rest.generationConfig && typeof rest.generationConfig === 'object'
					? (rest.generationConfig as Record<string, unknown>)
					: {};
			return {
				params: {
					...rest,
					generationConfig: {
						...existing,
						responseMimeType: 'application/json',
						responseSchema: strictSchema,
					},
				},
				family,
				applied: true,
			};
		}
		default: {
			const instruction = buildSchemaInstruction(
				normalized.name,
				normalized.description,
				strictSchema
			);
			return {
				params: {
					...rest,
					messages: prependSystemMessage(rest.messages, instruction),
				},
				family,
				applied: true,
			};
		}
	}
}

/**
 * Extract the structured-output payload from a completion when `response_schema` was used.
 * Returns the raw parsed JSON (or undefined if the response carried no usable payload).
 *
 * - OpenAI / fallback: parse the assistant text as JSON (stripping any code fences).
 * - Anthropic: read the forced `tool_use` block's `input` field.
 * - Google: parse the assistant text as JSON.
 */
export function getAIGatewayCompletionStructured(
	completion: unknown,
	family: AIGatewayProviderFamily = 'unknown'
): unknown {
	if (family === 'anthropic') {
		const result = getAIGatewayCompletionTextResult(completion);
		const toolUse = result.toolCalls?.find(
			(call) =>
				call && typeof call === 'object' && (call as { type?: unknown }).type === 'tool_use'
		);
		if (toolUse && typeof toolUse === 'object') {
			return (toolUse as { input?: unknown }).input;
		}
	}
	const text = getAIGatewayCompletionText(completion);
	if (!text) return undefined;
	return parseJsonLoose(text);
}

function parseJsonLoose(text: string): unknown {
	const stripped = stripJsonCodeFence(text).trim();
	if (!stripped) return undefined;
	try {
		return JSON.parse(stripped);
	} catch {
		return undefined;
	}
}

function stripJsonCodeFence(text: string): string {
	const trimmed = text.trim();
	const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
	return fence?.[1] ?? trimmed;
}

export const AIGatewayChatCompletionStreamParamsSchema =
	AIGatewayChatCompletionParamsSchema.safeExtend({
		stream: z.literal(true).describe('Enable Server-Sent Events streaming.'),
	});

export type AIGatewayChatCompletionStreamParams = z.infer<
	typeof AIGatewayChatCompletionStreamParamsSchema
>;

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
						unit: z.string().optional().describe('Gateway billing unit.'),
						inputQuantity: z
							.number()
							.optional()
							.describe('Input quantity used for non-token gateway billing.'),
						outputQuantity: z
							.number()
							.optional()
							.describe('Output quantity used for non-token gateway billing.'),
						promptTokens: z
							.number()
							.optional()
							.describe('Prompt token count used for gateway billing.'),
						completionTokens: z
							.number()
							.optional()
							.describe('Completion token count used for gateway billing.'),
						reasoningTokens: z
							.number()
							.optional()
							.describe(
								'Reasoning token count reported by the model provider when available.'
							),
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
			unit: z.string().optional(),
			inputQuantity: z.number().optional(),
			outputQuantity: z.number().optional(),
			promptTokens: z.number().optional(),
			completionTokens: z.number().optional(),
			reasoningTokens: z.number().optional(),
		})
		.optional(),
});

export type AIGatewayResponseMetadata = z.infer<typeof AIGatewayResponseMetadataSchema>;

export type AIGatewayStreamingCompletion = {
	stream: ReadableStream<Uint8Array>;
	metadata: Promise<AIGatewayResponseMetadata>;
};

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

export function getAIGatewayTextFromParts(parts: unknown): string {
	if (typeof parts === 'string') return parts;
	if (!Array.isArray(parts)) return '';

	return parts
		.map((part) => {
			if (typeof part === 'string') return part;
			if (!part || typeof part !== 'object') return '';

			const text =
				(part as { text?: unknown; content?: unknown }).text ??
				(part as { text?: unknown; content?: unknown }).content;

			return typeof text === 'string' ? text : '';
		})
		.join('');
}

export type AIGatewayCompletionTextReason =
	| 'stop'
	| 'length'
	| 'tool_calls'
	| 'content_filter'
	| 'refusal'
	| 'no_content'
	| 'unknown';

export interface AIGatewayCompletionTextResult {
	/** Concatenated assistant text. Empty string if the response carried no textual content. */
	text: string;
	/** Whether any textual content was found. False distinguishes "empty response" from "response was ''". */
	hasText: boolean;
	/** Best-effort finish reason normalized across provider shapes. `undefined` when not reported. */
	finishReason?: AIGatewayCompletionTextReason;
	/** Tool calls reported by the model, if any (OpenAI shape or Anthropic tool_use blocks). */
	toolCalls?: unknown[];
}

const KNOWN_FINISH_REASONS: ReadonlySet<AIGatewayCompletionTextReason> = new Set([
	'stop',
	'length',
	'tool_calls',
	'content_filter',
	'refusal',
	'no_content',
	'unknown',
]);

function normalizeFinishReason(value: unknown): AIGatewayCompletionTextReason | undefined {
	if (typeof value !== 'string') return undefined;
	const lower = value.toLowerCase();
	switch (lower) {
		case 'stop':
		case 'end_turn':
		case 'stop_sequence':
		case 'finish':
		case 'completed':
			return 'stop';
		case 'incomplete':
		case 'in_progress':
			return 'unknown';
		case 'cancelled':
		case 'canceled':
		case 'failed':
			return 'unknown';
		case 'length':
		case 'max_tokens':
		case 'max_output_tokens':
			return 'length';
		case 'tool_calls':
		case 'tool_use':
		case 'function_call':
			return 'tool_calls';
		case 'content_filter':
		case 'safety':
			return 'content_filter';
		case 'refusal':
			return 'refusal';
		default:
			return KNOWN_FINISH_REASONS.has(lower as AIGatewayCompletionTextReason)
				? (lower as AIGatewayCompletionTextReason)
				: 'unknown';
	}
}

function collectToolCalls(value: unknown): unknown[] | undefined {
	if (!Array.isArray(value) || value.length === 0) return undefined;
	return value;
}

function extractFromOpenAIChoices(
	completion: Record<string, unknown>
): AIGatewayCompletionTextResult | undefined {
	const choices = completion.choices;
	if (!Array.isArray(choices) || choices.length === 0) return undefined;

	const texts: string[] = [];
	let sawTextField = false;
	let finishReason: AIGatewayCompletionTextReason | undefined;
	let toolCalls: unknown[] | undefined;

	for (const choice of choices) {
		if (!isUnknownRecord(choice)) continue;
		const message = choice.message;
		if (isUnknownRecord(message)) {
			const content = message.content;
			if (content !== undefined && content !== null) {
				sawTextField = true;
				texts.push(getAIGatewayTextFromParts(content));
			}
			const calls = collectToolCalls(message.tool_calls);
			if (calls) toolCalls = toolCalls ? [...toolCalls, ...calls] : calls;
		}
		// Legacy completions-style text field.
		if (typeof choice.text === 'string') {
			sawTextField = true;
			texts.push(choice.text);
		}
		finishReason ??= normalizeFinishReason(choice.finish_reason);
	}

	if (!sawTextField && !finishReason && !toolCalls) return undefined;

	return {
		text: texts.join(''),
		hasText: sawTextField,
		...(finishReason ? { finishReason } : {}),
		...(toolCalls ? { toolCalls } : {}),
	};
}

function extractFromOpenAIResponses(
	completion: Record<string, unknown>
): AIGatewayCompletionTextResult | undefined {
	const output = completion.output;
	if (!Array.isArray(output)) return undefined;

	const texts: string[] = [];
	let sawTextField = false;
	let toolCalls: unknown[] | undefined;

	for (const item of output) {
		if (!isUnknownRecord(item)) continue;
		const type = item.type;
		if (type === 'function_call' || type === 'tool_use') {
			toolCalls = toolCalls ? [...toolCalls, item] : [item];
			continue;
		}
		const content = item.content;
		if (content !== undefined && content !== null) {
			sawTextField = true;
			texts.push(getAIGatewayTextFromParts(content));
		}
	}

	const topLevelText = (completion as { output_text?: unknown }).output_text;
	if (typeof topLevelText === 'string') {
		sawTextField = true;
		texts.push(topLevelText);
	}

	if (!sawTextField && !toolCalls && completion.status === undefined) return undefined;

	const finishReason =
		normalizeFinishReason(completion.status) ?? normalizeFinishReason(completion.stop_reason);

	return {
		text: texts.join(''),
		hasText: sawTextField,
		...(finishReason ? { finishReason } : {}),
		...(toolCalls ? { toolCalls } : {}),
	};
}

function extractFromAnthropicMessages(
	completion: Record<string, unknown>
): AIGatewayCompletionTextResult | undefined {
	const content = completion.content;
	if (!Array.isArray(content)) return undefined;

	const texts: string[] = [];
	let sawTextField = false;
	let toolCalls: unknown[] | undefined;

	for (const part of content) {
		if (!isUnknownRecord(part)) continue;
		const type = part.type;
		if (type === 'tool_use') {
			toolCalls = toolCalls ? [...toolCalls, part] : [part];
			continue;
		}
		const text = part.text;
		if (typeof text === 'string') {
			sawTextField = true;
			texts.push(text);
		}
	}

	const finishReason = normalizeFinishReason(completion.stop_reason);

	if (!sawTextField && !toolCalls && !finishReason) return undefined;

	return {
		text: texts.join(''),
		hasText: sawTextField,
		...(finishReason ? { finishReason } : {}),
		...(toolCalls ? { toolCalls } : {}),
	};
}

function extractFromGoogleCandidates(
	completion: Record<string, unknown>
): AIGatewayCompletionTextResult | undefined {
	const candidates = completion.candidates;
	if (!Array.isArray(candidates) || candidates.length === 0) return undefined;

	const texts: string[] = [];
	let sawTextField = false;
	let finishReason: AIGatewayCompletionTextReason | undefined;

	for (const candidate of candidates) {
		if (!isUnknownRecord(candidate)) continue;
		const content = candidate.content;
		const parts = isUnknownRecord(content) ? content.parts : undefined;
		if (parts !== undefined) {
			sawTextField = true;
			texts.push(getAIGatewayTextFromParts(parts));
		}
		finishReason ??= normalizeFinishReason(candidate.finishReason);
	}

	if (!sawTextField && !finishReason) return undefined;

	return {
		text: texts.join(''),
		hasText: sawTextField,
		...(finishReason ? { finishReason } : {}),
	};
}

/**
 * Extract the assistant's textual reply from an `AIGatewayChatCompletion`, normalizing across
 * OpenAI Chat Completions, OpenAI Responses, Anthropic Messages, and Google Generative AI
 * response shapes. Concatenates content-parts arrays.
 *
 * Returns a structured result so callers can distinguish "the model returned no text" (e.g. it
 * stopped because of `tool_calls` or `length`) from "the model returned an empty string". For
 * the common case of just wanting the string, see {@link getAIGatewayCompletionText}.
 */
export function getAIGatewayCompletionTextResult(
	completion: unknown
): AIGatewayCompletionTextResult {
	if (!isUnknownRecord(completion)) {
		return { text: '', hasText: false };
	}

	return (
		extractFromOpenAIChoices(completion) ??
		extractFromOpenAIResponses(completion) ??
		extractFromAnthropicMessages(completion) ??
		extractFromGoogleCandidates(completion) ?? { text: '', hasText: false }
	);
}

/**
 * Extract the assistant's textual reply from an `AIGatewayChatCompletion` as a plain string.
 * Concatenates content-parts arrays; returns `''` when the response carried no textual content.
 * Use {@link getAIGatewayCompletionTextResult} when you need to distinguish "no text" from `''`.
 */
export function getAIGatewayCompletionText(completion: unknown): string {
	return getAIGatewayCompletionTextResult(completion).text;
}

export function getAIGatewayStreamDeltaText(payload: unknown): string {
	if (Array.isArray(payload)) {
		return payload.map(getAIGatewayStreamDeltaText).join('');
	}
	if (!payload || typeof payload !== 'object') return '';

	const type = (payload as { type?: unknown }).type;
	if (typeof type === 'string' && type.startsWith('response.reasoning_')) return '';
	if (type === 'content_block_delta') {
		const delta = (payload as { delta?: unknown }).delta;
		if (!delta || typeof delta !== 'object') return '';
		if ((delta as { type?: unknown }).type !== 'text_delta') return '';

		const text = (delta as { text?: unknown }).text;

		return typeof text === 'string' ? text : '';
	}
	if (type === 'response.output_text.delta') {
		const delta = (payload as { delta?: unknown }).delta;

		return typeof delta === 'string' ? delta : '';
	}
	if (type === 'response.output_text.done') {
		return '';
	}

	const delta = (payload as { delta?: unknown }).delta;
	if (typeof delta === 'string') return delta;
	if (delta && typeof delta === 'object') {
		const text = (delta as { text?: unknown; content?: unknown }).text;
		const content = (delta as { text?: unknown; content?: unknown }).content;

		if (typeof text === 'string') return text;
		if (typeof content === 'string') return content;
	}

	const content = (payload as { content?: unknown }).content;
	if (typeof content === 'string') return content;
	const directContent = getAIGatewayTextFromParts(content);
	if (directContent) return directContent;

	const choices = (payload as { choices?: unknown }).choices;
	if (Array.isArray(choices)) {
		return choices
			.map((choice) => {
				if (!choice || typeof choice !== 'object') return '';

				const choiceDelta = (choice as { delta?: { content?: unknown } }).delta;
				if (typeof choiceDelta?.content === 'string') return choiceDelta.content;

				const text = (choice as { text?: unknown }).text;
				return typeof text === 'string' ? text : '';
			})
			.join('');
	}

	const candidates = (payload as { candidates?: unknown }).candidates;
	if (!Array.isArray(candidates)) return '';

	return candidates
		.map((candidate) => {
			if (!candidate || typeof candidate !== 'object') return '';

			const candidateContent = (candidate as { content?: unknown }).content;
			const parts =
				candidateContent && typeof candidateContent === 'object'
					? (candidateContent as { parts?: unknown }).parts
					: undefined;

			return getAIGatewayTextFromParts(parts);
		})
		.join('');
}

export function getAIGatewayStreamReasoningText(payload: unknown): string {
	if (Array.isArray(payload)) {
		return payload.map(getAIGatewayStreamReasoningText).join('');
	}
	if (!payload || typeof payload !== 'object') return '';

	const type = (payload as { type?: unknown }).type;
	if (type === 'content_block_start') {
		const contentBlock = (payload as { content_block?: unknown }).content_block;
		if (!contentBlock || typeof contentBlock !== 'object') return '';
		if ((contentBlock as { type?: unknown }).type !== 'thinking') return '';

		const thinking = (contentBlock as { thinking?: unknown }).thinking;

		return typeof thinking === 'string' ? thinking : '';
	}
	if (type === 'content_block_delta') {
		const delta = (payload as { delta?: unknown }).delta;
		if (!delta || typeof delta !== 'object') return '';
		if ((delta as { type?: unknown }).type !== 'thinking_delta') return '';

		const thinking = (delta as { thinking?: unknown }).thinking;

		return typeof thinking === 'string' ? thinking : '';
	}
	if (type === 'response.reasoning_summary_text.delta') {
		const delta = (payload as { delta?: unknown }).delta;

		return typeof delta === 'string' ? delta : '';
	}
	if (type === 'response.reasoning_text.delta') {
		const delta = (payload as { delta?: unknown }).delta;

		return typeof delta === 'string' ? delta : '';
	}
	if (type === 'response.reasoning_summary_text.done') {
		return '';
	}

	const direct =
		(payload as { reasoning?: unknown }).reasoning ??
		(payload as { reasoning_content?: unknown }).reasoning_content;
	if (typeof direct === 'string') return direct;

	const choices = (payload as { choices?: unknown }).choices;
	if (!Array.isArray(choices)) return '';

	return choices
		.map((choice) => {
			if (!choice || typeof choice !== 'object') return '';

			const delta = (choice as { delta?: unknown }).delta;
			if (!delta || typeof delta !== 'object') return '';

			const reasoning =
				(delta as { reasoning?: unknown }).reasoning ??
				(delta as { reasoning_content?: unknown }).reasoning_content;

			return typeof reasoning === 'string' ? reasoning : '';
		})
		.join('');
}

export interface AIGatewayRequestOptions {
	path: string;
	method?: 'GET' | 'PUT' | 'POST' | 'DELETE' | 'HEAD' | 'OPTIONS' | 'PATCH';
	body?: unknown;
	headers?: Record<string, string>;
	stream?: boolean;
}

export interface AIGatewayRequestResponse<T = unknown> {
	data: T;
	response: Response;
	metadata: AIGatewayResponseMetadata;
}

function parseNumber(value: string | undefined): number | undefined {
	if (value === undefined || value.trim() === '') {
		return undefined;
	}
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : undefined;
}

function positiveNumber(value: unknown): number | undefined {
	return typeof value === 'number' && value > 0 ? value : undefined;
}

function getNestedNumber(value: unknown, path: string[]): number | undefined {
	let current = value;
	for (const key of path) {
		if (!current || typeof current !== 'object') {
			return undefined;
		}
		current = (current as Record<string, unknown>)[key];
	}

	return typeof current === 'number' ? current : undefined;
}

function getReasoningTokensFromPayload(payload: unknown): number | undefined {
	return (
		positiveNumber(
			getNestedNumber(payload, ['usage', 'output_tokens_details', 'reasoning_tokens'])
		) ??
		positiveNumber(
			getNestedNumber(payload, ['usage', 'completion_tokens_details', 'reasoning_tokens'])
		)
	);
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
	const unit = captured['x-gateway-billing-unit'];
	const inputQuantity = parseNumber(captured['x-gateway-input-quantity']);
	const outputQuantity = parseNumber(captured['x-gateway-output-quantity']);
	const promptTokens = parseNumber(captured['x-gateway-prompt-tokens']);
	const completionTokens = parseNumber(captured['x-gateway-completion-tokens']);
	const reasoningTokens =
		positiveNumber(parseNumber(captured['x-gateway-reasoning-tokens'])) ??
		positiveNumber(parseNumber(captured['x-gateway-reasoning-token-count'])) ??
		positiveNumber(parseNumber(captured['x-agentuity-reasoning-tokens'])) ??
		positiveNumber(parseNumber(captured['x-agentuity-reasoning-token-count']));
	const cost =
		total !== undefined ||
		unit !== undefined ||
		inputQuantity !== undefined ||
		outputQuantity !== undefined ||
		promptTokens !== undefined ||
		completionTokens !== undefined ||
		reasoningTokens !== undefined
			? {
					total,
					unit,
					inputQuantity,
					outputQuantity,
					promptTokens,
					completionTokens,
					reasoningTokens,
				}
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

function mergeGatewayMetadata(
	first: AIGatewayResponseMetadata,
	second: AIGatewayResponseMetadata
): AIGatewayResponseMetadata {
	const headers =
		first.headers || second.headers
			? { ...(first.headers ?? {}), ...(second.headers ?? {}) }
			: undefined;
	const cost =
		first.cost || second.cost ? { ...(first.cost ?? {}), ...(second.cost ?? {}) } : undefined;

	return {
		...(headers ? { headers } : {}),
		...(cost ? { cost } : {}),
	};
}

function extractCostFromPayload(payload: unknown): AIGatewayResponseMetadata {
	if (!payload || typeof payload !== 'object') return {};

	const response =
		(payload as { response?: unknown }).response &&
		(payload as { type?: unknown }).type === 'response.completed'
			? (payload as { response?: unknown }).response
			: payload;
	if (!response || typeof response !== 'object') return {};

	const agentuity = (response as { agentuity?: unknown }).agentuity;
	if (agentuity && typeof agentuity === 'object') {
		const headers = (agentuity as { headers?: unknown }).headers;
		const cost = (agentuity as { cost?: unknown }).cost;
		const reasoningTokens = getReasoningTokensFromPayload(response);
		const normalizedCost =
			cost && typeof cost === 'object'
				? {
						...(cost as AIGatewayResponseMetadata['cost']),
						...(reasoningTokens !== undefined ? { reasoningTokens } : {}),
					}
				: reasoningTokens !== undefined
					? { reasoningTokens }
					: undefined;

		return {
			...(headers && typeof headers === 'object'
				? { headers: headers as Record<string, string> }
				: {}),
			...(normalizedCost ? { cost: normalizedCost } : {}),
		};
	}

	const reasoningTokens = getReasoningTokensFromPayload(response);

	return reasoningTokens !== undefined ? { cost: { reasoningTokens } } : {};
}

function streamWithGatewayMetadata(stream: ReadableStream<Uint8Array>): {
	metadata: Promise<AIGatewayResponseMetadata>;
	stream: ReadableStream<Uint8Array>;
} {
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	let buffer = '';
	let readerReleased = false;
	let metadata: AIGatewayResponseMetadata = {};
	let resolveMetadata!: (metadata: AIGatewayResponseMetadata) => void;
	let rejectMetadata!: (error: unknown) => void;
	const metadataPromise = new Promise<AIGatewayResponseMetadata>((resolve, reject) => {
		resolveMetadata = resolve;
		rejectMetadata = reject;
	});

	const consumeData = (data: string) => {
		if (!data || data === '[DONE]') return;

		try {
			const next = extractCostFromPayload(JSON.parse(data));
			metadata = mergeGatewayMetadata(metadata, next);
		} catch {
			// Ignore malformed SSE frames while continuing to drain the stream.
		}
	};
	const normalizeSseText = (value: string) => {
		try {
			const parsed = JSON.parse(value);

			return typeof parsed === 'string' ? parsed : value;
		} catch {
			return value;
		}
	};
	const releaseReader = () => {
		if (readerReleased) return;

		readerReleased = true;
		reader.releaseLock();
	};

	const readable = new ReadableStream<Uint8Array>({
		async pull(controller) {
			if (typeof controller.desiredSize === 'number' && controller.desiredSize <= 0) {
				return;
			}

			let shouldReleaseReader = false;
			try {
				while (typeof controller.desiredSize !== 'number' || controller.desiredSize > 0) {
					const { done, value } = await reader.read();
					if (done) {
						buffer += decoder.decode();
						for (const line of normalizeSseText(buffer).split(/\r?\n/)) {
							if (line.startsWith('data:')) {
								consumeData(line.slice(5).trimStart());
							}
						}
						resolveMetadata(metadata);
						controller.close();
						shouldReleaseReader = true;
						return;
					}

					controller.enqueue(value);
					buffer += decoder.decode(value, { stream: true });
					const lines = buffer.split(/\r?\n/);
					buffer = lines.pop() ?? '';

					for (const line of lines) {
						if (line.startsWith('data:')) {
							consumeData(line.slice(5).trimStart());
						}
					}
				}
			} catch (error) {
				rejectMetadata(error);
				controller.error(error);
				shouldReleaseReader = true;
			} finally {
				if (shouldReleaseReader) {
					releaseReader();
				}
			}
		},
		cancel(reason) {
			rejectMetadata(reason);
			return reader.cancel(reason).finally(releaseReader);
		},
	});

	return { stream: readable, metadata: metadataPromise };
}

function attachGatewayMetadata<T extends Record<string, unknown>>(
	payload: T,
	metadata: AIGatewayResponseMetadata
): T {
	const reasoningTokens =
		positiveNumber(metadata.cost?.reasoningTokens) ?? getReasoningTokensFromPayload(payload);
	const cost =
		metadata.cost || reasoningTokens !== undefined
			? {
					...(metadata.cost ?? {}),
					...(reasoningTokens !== undefined ? { reasoningTokens } : {}),
				}
			: undefined;

	if (!metadata.headers && !cost) {
		return payload;
	}
	return {
		...payload,
		agentuity: {
			...(typeof payload.agentuity === 'object' && payload.agentuity !== null
				? payload.agentuity
				: {}),
			...(metadata.headers ? { headers: metadata.headers } : {}),
			...(cost ? { cost } : {}),
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
		const { params: translated } = applyAIGatewayResponseSchema(params);
		const [body, contentType] = await toPayload(
			AIGatewayChatCompletionParamsSchema.parse(translated)
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

	async request<T = unknown>(
		options: AIGatewayRequestOptions
	): Promise<AIGatewayRequestResponse<T>> {
		const method = options.method ?? 'POST';
		const url = buildUrl(this.baseUrl, options.path);
		const payload =
			options.body === undefined && (method === 'GET' || method === 'HEAD')
				? undefined
				: await toPayload(options.body);
		const response = await this.adapter.invoke<T>(url, {
			method,
			...(payload ? { body: payload[0], contentType: payload[1] } : {}),
			...(options.headers ? { headers: options.headers } : {}),
			telemetry: { name: 'aigateway.request' },
		});
		if (!response.ok) {
			throw await toServiceException(method, url, response.response);
		}
		return {
			data: response.data,
			response: response.response,
			metadata: await extractGatewayMetadata(response.response),
		};
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
		const { params: translated } = applyAIGatewayResponseSchema(params);
		const [body, contentType] = await toPayload(
			AIGatewayChatCompletionParamsSchema.parse({ ...translated, stream: true })
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
		const streamed = streamWithGatewayMetadata(response.response.body);
		return {
			stream: streamed.stream,
			metadata: Promise.all([extractGatewayMetadata(response.response), streamed.metadata]).then(
				([responseMetadata, streamMetadata]) =>
					mergeGatewayMetadata(responseMetadata, streamMetadata)
			),
		};
	}

	async streamRequest(options: AIGatewayRequestOptions): Promise<AIGatewayStreamingCompletion> {
		const method = options.method ?? 'POST';
		const url = buildUrl(this.baseUrl, options.path);
		const [body, contentType] = await toPayload(options.body);
		const response = await this.adapter.invoke<never>(url, {
			method,
			body,
			contentType,
			headers: { Accept: 'text/event-stream', ...(options.headers ?? {}) },
			binary: true,
			telemetry: { name: 'aigateway.request.stream' },
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
		const streamed = streamWithGatewayMetadata(response.response.body);
		return {
			stream: streamed.stream,
			metadata: Promise.all([extractGatewayMetadata(response.response), streamed.metadata]).then(
				([responseMetadata, streamMetadata]) =>
					mergeGatewayMetadata(responseMetadata, streamMetadata)
			),
		};
	}
}
