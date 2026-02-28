/**
 * Runtime OpenTelemetry LLM instrumentation patches for dev mode.
 *
 * Replaces the build-time patches from cli/src/cmd/build/patch/otel-llm.ts.
 * Wraps LLM SDK methods (OpenAI, Anthropic, Groq) with OTel spans to capture
 * model, tokens, latency, and streaming support.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import type { Span } from '@opentelemetry/api';

const ATTR_GEN_AI_SYSTEM = 'gen_ai.system';
const ATTR_GEN_AI_REQUEST_MODEL = 'gen_ai.request.model';
const ATTR_GEN_AI_REQUEST_MAX_TOKENS = 'gen_ai.request.max_tokens';
const ATTR_GEN_AI_REQUEST_TEMPERATURE = 'gen_ai.request.temperature';
const ATTR_GEN_AI_REQUEST_TOP_P = 'gen_ai.request.top_p';
const ATTR_GEN_AI_REQUEST_FREQUENCY_PENALTY = 'gen_ai.request.frequency_penalty';
const ATTR_GEN_AI_REQUEST_PRESENCE_PENALTY = 'gen_ai.request.presence_penalty';
const ATTR_GEN_AI_RESPONSE_MODEL = 'gen_ai.response.model';
const ATTR_GEN_AI_RESPONSE_ID = 'gen_ai.response.id';
const ATTR_GEN_AI_RESPONSE_FINISH_REASONS = 'gen_ai.response.finish_reasons';
const ATTR_GEN_AI_USAGE_INPUT_TOKENS = 'gen_ai.usage.input_tokens';
const ATTR_GEN_AI_USAGE_OUTPUT_TOKENS = 'gen_ai.usage.output_tokens';
const ATTR_GEN_AI_OPERATION_NAME = 'gen_ai.operation.name';
const ATTR_GEN_AI_REQUEST_MESSAGES = 'gen_ai.request.messages';
const ATTR_GEN_AI_RESPONSE_TEXT = 'gen_ai.response.text';

const otelTracer = trace.getTracer('@agentuity/otel-llm', '1.0.0');

interface OtelPatchConfig {
	provider: string;
	inputTokensField: string;
	outputTokensField: string;
	responseIdField: string;
	finishReasonExtractor: (response: any) => string | undefined;
	responseContentExtractor: (response: any) => string | undefined;
	requestMessagesField: string;
	streamDeltaContentExtractor: (chunk: any) => string | undefined;
	streamFinishReasonExtractor: (chunk: any) => string | undefined;
	streamUsageExtractor: (chunk: any) => any;
}

function wrapAsyncIterator(
	iterator: AsyncIterator<any>,
	span: Span,
	config: OtelPatchConfig
): AsyncIterableIterator<any> {
	const contentChunks: string[] = [];
	let finishReason: string | null = null;
	let usage: any = null;
	let model: string | null = null;
	let responseId: string | null = null;

	return {
		[Symbol.asyncIterator]() {
			return this;
		},
		async next() {
			try {
				const result = await iterator.next();
				if (result.done) {
					// Stream complete — finalize span
					if (contentChunks.length > 0) {
						span.setAttribute(ATTR_GEN_AI_RESPONSE_TEXT, contentChunks.join(''));
					}
					if (finishReason) {
						span.setAttribute(
							ATTR_GEN_AI_RESPONSE_FINISH_REASONS,
							JSON.stringify([finishReason])
						);
					}
					if (model) {
						span.setAttribute(ATTR_GEN_AI_RESPONSE_MODEL, model);
					}
					if (responseId) {
						span.setAttribute(ATTR_GEN_AI_RESPONSE_ID, responseId);
					}
					if (usage) {
						if (usage[config.inputTokensField] !== undefined) {
							span.setAttribute(
								ATTR_GEN_AI_USAGE_INPUT_TOKENS,
								usage[config.inputTokensField]
							);
						}
						if (usage[config.outputTokensField] !== undefined) {
							span.setAttribute(
								ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
								usage[config.outputTokensField]
							);
						}
					}
					span.setStatus({ code: SpanStatusCode.OK });
					span.end();
					return result;
				}

				const chunk = result.value;

				if (chunk.model && !model) model = chunk.model;
				if (chunk.id && !responseId) responseId = chunk.id;

				const deltaContent = config.streamDeltaContentExtractor(chunk);
				if (deltaContent) contentChunks.push(deltaContent);

				const chunkFinishReason = config.streamFinishReasonExtractor(chunk);
				if (chunkFinishReason) finishReason = chunkFinishReason;

				const chunkUsage = config.streamUsageExtractor(chunk);
				if (chunkUsage) usage = chunkUsage;

				return result;
			} catch (error: any) {
				span.setStatus({ code: SpanStatusCode.ERROR, message: error?.message });
				span.recordException(error);
				span.end();
				throw error;
			}
		},
		async return(value?: any) {
			span.setStatus({ code: SpanStatusCode.OK });
			span.end();
			if (iterator.return) {
				return iterator.return(value);
			}
			return { done: true as const, value };
		},
		async throw(error?: any) {
			span.setStatus({ code: SpanStatusCode.ERROR, message: error?.message });
			span.recordException(error);
			span.end();
			if (iterator.throw) {
				return iterator.throw(error);
			}
			throw error;
		},
	};
}

function wrapStream(stream: any, span: Span, config: OtelPatchConfig): any {
	const originalIterator = stream[Symbol.asyncIterator]();
	const wrappedIterator = wrapAsyncIterator(originalIterator, span, config);

	return new Proxy(stream, {
		get(target, prop) {
			if (prop === Symbol.asyncIterator) {
				return () => wrappedIterator;
			}
			const value = target[prop];
			if (typeof value === 'function') {
				return value.bind(target);
			}
			return value;
		},
	});
}

function createOtelWrapper(
	originalCreate: (...args: any[]) => any,
	config: OtelPatchConfig
): (body: any, options?: any) => any {
	return function _agentuityOtelCreate(this: any, body: any, options?: any) {
		const attributes: Record<string, any> = {
			[ATTR_GEN_AI_SYSTEM]: config.provider,
			[ATTR_GEN_AI_OPERATION_NAME]: 'chat',
		};

		if (body.model) attributes[ATTR_GEN_AI_REQUEST_MODEL] = body.model;
		if (body.max_tokens) attributes[ATTR_GEN_AI_REQUEST_MAX_TOKENS] = body.max_tokens;
		if (body.temperature !== undefined)
			attributes[ATTR_GEN_AI_REQUEST_TEMPERATURE] = body.temperature;
		if (body.top_p !== undefined) attributes[ATTR_GEN_AI_REQUEST_TOP_P] = body.top_p;
		if (body.frequency_penalty !== undefined)
			attributes[ATTR_GEN_AI_REQUEST_FREQUENCY_PENALTY] = body.frequency_penalty;
		if (body.presence_penalty !== undefined)
			attributes[ATTR_GEN_AI_REQUEST_PRESENCE_PENALTY] = body.presence_penalty;

		// Capture request messages
		const messages = body[config.requestMessagesField];
		if (messages && Array.isArray(messages)) {
			try {
				attributes[ATTR_GEN_AI_REQUEST_MESSAGES] = JSON.stringify(messages);
			} catch {
				// Ignore serialization errors
			}
		}

		const spanName = body.model ? `chat ${body.model}` : 'chat';

		return otelTracer.startActiveSpan(
			spanName,
			{ attributes, kind: SpanKind.CLIENT },
			(span: Span) => {
				let result: any;
				try {
					result = originalCreate.call(this, body, options);
				} catch (error: any) {
					span.setStatus({ code: SpanStatusCode.ERROR, message: error?.message });
					span.recordException(error);
					span.end();
					throw error;
				}

				// Handle streaming responses
				if (body.stream) {
					if (result && typeof result.then === 'function') {
						return result
							.then((stream: any) => {
								try {
									return wrapStream(stream, span, config);
								} catch (error: any) {
									span.setStatus({
										code: SpanStatusCode.ERROR,
										message: error?.message,
									});
									span.recordException(error);
									span.end();
									throw error;
								}
							})
							.catch((error: any) => {
								span.setStatus({ code: SpanStatusCode.ERROR, message: error?.message });
								span.recordException(error);
								span.end();
								throw error;
							});
					}
					try {
						return wrapStream(result, span, config);
					} catch (error: any) {
						span.setStatus({ code: SpanStatusCode.ERROR, message: error?.message });
						span.recordException(error);
						span.end();
						throw error;
					}
				}

				// Handle non-streaming responses
				if (result && typeof result.then === 'function') {
					return result
						.then((response: any) => {
							if (response) {
								if (response.model) {
									span.setAttribute(ATTR_GEN_AI_RESPONSE_MODEL, response.model);
								}
								if (response[config.responseIdField]) {
									span.setAttribute(
										ATTR_GEN_AI_RESPONSE_ID,
										response[config.responseIdField]
									);
								}
								if (response.usage) {
									if (response.usage[config.inputTokensField] !== undefined) {
										span.setAttribute(
											ATTR_GEN_AI_USAGE_INPUT_TOKENS,
											response.usage[config.inputTokensField]
										);
									}
									if (response.usage[config.outputTokensField] !== undefined) {
										span.setAttribute(
											ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
											response.usage[config.outputTokensField]
										);
									}
								}
								const finishReason = config.finishReasonExtractor(response);
								if (finishReason) {
									span.setAttribute(
										ATTR_GEN_AI_RESPONSE_FINISH_REASONS,
										JSON.stringify([finishReason])
									);
								}
								const responseContent = config.responseContentExtractor(response);
								if (responseContent) {
									span.setAttribute(ATTR_GEN_AI_RESPONSE_TEXT, responseContent);
								}
							}
							span.setStatus({ code: SpanStatusCode.OK });
							span.end();
							return response;
						})
						.catch((error: any) => {
							span.setStatus({ code: SpanStatusCode.ERROR, message: error?.message });
							span.recordException(error);
							span.end();
							throw error;
						});
				}

				span.end();
				return result;
			}
		);
	};
}

/** Provider-specific configurations matching the build-time patches */
const OTEL_CONFIGS: Array<{
	module: string;
	className: string;
	config: OtelPatchConfig;
}> = [
	{
		module: 'openai',
		// In the openai SDK, the Completions class is in resources/chat/completions
		// We need to import the main module and access the prototype
		className: 'Completions',
		config: {
			provider: 'openai',
			inputTokensField: 'prompt_tokens',
			outputTokensField: 'completion_tokens',
			responseIdField: 'id',
			finishReasonExtractor: (r) => r?.choices?.[0]?.finish_reason,
			responseContentExtractor: (r) => r?.choices?.[0]?.message?.content,
			requestMessagesField: 'messages',
			streamDeltaContentExtractor: (c) => c?.choices?.[0]?.delta?.content,
			streamFinishReasonExtractor: (c) => c?.choices?.[0]?.finish_reason,
			streamUsageExtractor: (c) => c?.usage,
		},
	},
	{
		module: '@anthropic-ai/sdk',
		className: 'Messages',
		config: {
			provider: 'anthropic',
			inputTokensField: 'input_tokens',
			outputTokensField: 'output_tokens',
			responseIdField: 'id',
			finishReasonExtractor: (r) => r?.stop_reason,
			responseContentExtractor: (r) => r?.content?.[0]?.text,
			requestMessagesField: 'messages',
			streamDeltaContentExtractor: (c) => c?.delta?.text,
			streamFinishReasonExtractor: (c) => c?.delta?.stop_reason,
			streamUsageExtractor: (c) => c?.usage,
		},
	},
	{
		module: 'groq-sdk',
		className: 'Completions',
		config: {
			provider: 'groq',
			inputTokensField: 'prompt_tokens',
			outputTokensField: 'completion_tokens',
			responseIdField: 'id',
			finishReasonExtractor: (r) => r?.choices?.[0]?.finish_reason,
			responseContentExtractor: (r) => r?.choices?.[0]?.message?.content,
			requestMessagesField: 'messages',
			streamDeltaContentExtractor: (c) => c?.choices?.[0]?.delta?.content,
			streamFinishReasonExtractor: (c) => c?.choices?.[0]?.finish_reason,
			streamUsageExtractor: (c) => c?.x_groq?.usage,
		},
	},
];

/**
 * Find a class prototype by name within a module's exports (recursive search).
 * The SDKs nest classes in sub-objects (e.g., openai.Chat.Completions).
 */
function findPrototype(obj: any, className: string, depth = 0): any | null {
	if (depth > 5 || !obj || typeof obj !== 'object') return null;

	// Check if this object itself is the class we're looking for
	if (typeof obj === 'function' && obj.name === className && obj.prototype?.create) {
		return obj.prototype;
	}

	// Search properties
	for (const key of Object.keys(obj)) {
		try {
			const val = obj[key];
			if (typeof val === 'function' && val.name === className && val.prototype?.create) {
				return val.prototype;
			}
			if (typeof val === 'object' && val !== null) {
				const found = findPrototype(val, className, depth + 1);
				if (found) return found;
			}
		} catch {
			// Skip inaccessible properties
		}
	}
	return null;
}

/**
 * Apply OTel instrumentation patches to LLM SDK prototype methods.
 */
export async function applyOtelLLMPatches(): Promise<void> {
	for (const { module: moduleName, className, config } of OTEL_CONFIGS) {
		try {
			const mod = await import(moduleName);
			const proto = findPrototype(mod, className);

			if (!proto || typeof proto.create !== 'function') {
				console.debug(
					`[Agentuity OTel] Skipping patch: ${className}.prototype.create not found in ${moduleName}`
				);
				continue;
			}

			const originalCreate = proto.create;
			proto.create = createOtelWrapper(originalCreate, config);
		} catch {
			// Module not installed — skip
		}
	}
}
