/**
 * Build-time patches for OpenTelemetry LLM instrumentation.
 *
 * These patches wrap LLM SDK methods (OpenAI, Anthropic, etc.) with OTel spans
 * at build time, since runtime instrumentation (traceloop) doesn't work with
 * bundled code.
 */
import { type PatchModule } from './_util';

interface OtelPatchConfig {
	provider: string;
	className: string;
	inputTokensField: string;
	outputTokensField: string;
	/** Field path for response ID (e.g., 'id' for OpenAI) */
	responseIdField?: string;
	/** Field path for finish reason (e.g., 'choices[0].finish_reason' for OpenAI) */
	finishReasonPath?: string;
	/** Field path for response content (e.g., 'choices[0].message.content' for OpenAI) */
	responseContentPath?: string;
	/** Field name in request for messages (e.g., 'messages' for OpenAI) */
	requestMessagesField?: string;
	/** Field path for streaming delta content (e.g., 'choices[0].delta.content' for OpenAI) */
	streamDeltaContentPath?: string;
	/** Field path for streaming finish reason (e.g., 'choices[0].finish_reason' for OpenAI) */
	streamFinishReasonPath?: string;
	/** Field path for streaming usage in final chunk (e.g., 'usage' for OpenAI with stream_options) */
	streamUsagePath?: string;
}

/**
 * Generate the OTel wrapper code for LLM chat completions.
 * This creates a span with GenAI semantic conventions.
 */
function generateChatCompletionsWrapper(config: OtelPatchConfig): string {
	const {
		provider,
		className,
		inputTokensField,
		outputTokensField,
		responseIdField = 'id',
		finishReasonPath,
		responseContentPath,
		requestMessagesField = 'messages',
		streamDeltaContentPath,
		streamFinishReasonPath,
		streamUsagePath = 'usage',
	} = config;

	// Generate code to extract nested field (e.g., 'choices[0].finish_reason')
	const generateFieldAccess = (path: string | undefined, varName: string): string => {
		if (!path) return 'undefined';
		// Convert path like 'choices[0].finish_reason' to safe access
		const parts = path.split('.');
		let code = varName;
		for (const part of parts) {
			const match = part.match(/^(\w+)\[(\d+)\]$/);
			if (match) {
				code = `(${code}?.${match[1]}?.[${match[2]}])`;
			} else {
				code = `(${code}?.${part})`;
			}
		}
		return code;
	};

	const finishReasonCode = generateFieldAccess(finishReasonPath, 'response');
	const responseContentCode = generateFieldAccess(responseContentPath, 'response');
	const streamDeltaCode = generateFieldAccess(streamDeltaContentPath, 'chunk');
	const streamFinishCode = generateFieldAccess(streamFinishReasonPath, 'chunk');
	const streamUsageCode = generateFieldAccess(streamUsagePath, 'chunk');

	return `
import * as _otel_api from '@opentelemetry/api';

const _ATTR_GEN_AI_SYSTEM = 'gen_ai.system';
const _ATTR_GEN_AI_REQUEST_MODEL = 'gen_ai.request.model';
const _ATTR_GEN_AI_REQUEST_MAX_TOKENS = 'gen_ai.request.max_tokens';
const _ATTR_GEN_AI_REQUEST_TEMPERATURE = 'gen_ai.request.temperature';
const _ATTR_GEN_AI_REQUEST_TOP_P = 'gen_ai.request.top_p';
const _ATTR_GEN_AI_REQUEST_FREQUENCY_PENALTY = 'gen_ai.request.frequency_penalty';
const _ATTR_GEN_AI_REQUEST_PRESENCE_PENALTY = 'gen_ai.request.presence_penalty';
const _ATTR_GEN_AI_RESPONSE_MODEL = 'gen_ai.response.model';
const _ATTR_GEN_AI_RESPONSE_ID = 'gen_ai.response.id';
const _ATTR_GEN_AI_RESPONSE_FINISH_REASONS = 'gen_ai.response.finish_reasons';
const _ATTR_GEN_AI_USAGE_INPUT_TOKENS = 'gen_ai.usage.input_tokens';
const _ATTR_GEN_AI_USAGE_OUTPUT_TOKENS = 'gen_ai.usage.output_tokens';
const _ATTR_GEN_AI_OPERATION_NAME = 'gen_ai.operation.name';
const _ATTR_GEN_AI_REQUEST_MESSAGES = 'gen_ai.request.messages';
const _ATTR_GEN_AI_RESPONSE_TEXT = 'gen_ai.response.text';

const _otel_tracer = _otel_api.trace.getTracer('@agentuity/otel-llm', '1.0.0');

function _wrapAsyncIterator(iterator, span, inputTokensField, outputTokensField) {
	let contentChunks = [];
	let finishReason = null;
	let usage = null;
	let model = null;
	let responseId = null;

	return {
		[Symbol.asyncIterator]() {
			return this;
		},
		async next() {
			try {
				const result = await iterator.next();
				if (result.done) {
					// Stream complete - finalize span
					if (contentChunks.length > 0) {
						span.setAttribute(_ATTR_GEN_AI_RESPONSE_TEXT, contentChunks.join(''));
					}
					if (finishReason) {
						span.setAttribute(_ATTR_GEN_AI_RESPONSE_FINISH_REASONS, JSON.stringify([finishReason]));
					}
					if (model) {
						span.setAttribute(_ATTR_GEN_AI_RESPONSE_MODEL, model);
					}
					if (responseId) {
						span.setAttribute(_ATTR_GEN_AI_RESPONSE_ID, responseId);
					}
					if (usage) {
						if (usage[inputTokensField] !== undefined) {
							span.setAttribute(_ATTR_GEN_AI_USAGE_INPUT_TOKENS, usage[inputTokensField]);
						}
						if (usage[outputTokensField] !== undefined) {
							span.setAttribute(_ATTR_GEN_AI_USAGE_OUTPUT_TOKENS, usage[outputTokensField]);
						}
					}
					span.setStatus({ code: _otel_api.SpanStatusCode.OK });
					span.end();
					return result;
				}

				const chunk = result.value;
				
				// Capture model and id from first chunk
				if (chunk.model && !model) {
					model = chunk.model;
				}
				if (chunk.id && !responseId) {
					responseId = chunk.id;
				}

				// Capture delta content
				const deltaContent = ${streamDeltaCode};
				if (deltaContent) {
					contentChunks.push(deltaContent);
				}

				// Capture finish reason
				const chunkFinishReason = ${streamFinishCode};
				if (chunkFinishReason) {
					finishReason = chunkFinishReason;
				}

				// Capture usage (usually in final chunk with stream_options)
				const chunkUsage = ${streamUsageCode};
				if (chunkUsage) {
					usage = chunkUsage;
				}

				return result;
			} catch (error) {
				span.setStatus({ code: _otel_api.SpanStatusCode.ERROR, message: error?.message });
				span.recordException(error);
				span.end();
				throw error;
			}
		},
		async return(value) {
			span.setStatus({ code: _otel_api.SpanStatusCode.OK });
			span.end();
			if (iterator.return) {
				return iterator.return(value);
			}
			return { done: true, value };
		},
		async throw(error) {
			span.setStatus({ code: _otel_api.SpanStatusCode.ERROR, message: error?.message });
			span.recordException(error);
			span.end();
			if (iterator.throw) {
				return iterator.throw(error);
			}
			throw error;
		}
	};
}

function _wrapStream(stream, span, inputTokensField, outputTokensField) {
	// Get the original iterator
	const originalIterator = stream[Symbol.asyncIterator]();
	const wrappedIterator = _wrapAsyncIterator(originalIterator, span, inputTokensField, outputTokensField);
	
	// Return a proxy that wraps the async iterator but preserves other properties/methods
	return new Proxy(stream, {
		get(target, prop) {
			if (prop === Symbol.asyncIterator) {
				return () => wrappedIterator;
			}
			// Preserve other stream methods like tee(), toReadableStream(), etc.
			const value = target[prop];
			if (typeof value === 'function') {
				return value.bind(target);
			}
			return value;
		}
	});
}

const _original_create = ${className}.prototype.create;
${className}.prototype.create = function _agentuity_otel_create(body, options) {
	const attributes = {
		[_ATTR_GEN_AI_SYSTEM]: '${provider}',
		[_ATTR_GEN_AI_OPERATION_NAME]: 'chat',
	};

	if (body.model) {
		attributes[_ATTR_GEN_AI_REQUEST_MODEL] = body.model;
	}
	if (body.max_tokens) {
		attributes[_ATTR_GEN_AI_REQUEST_MAX_TOKENS] = body.max_tokens;
	}
	if (body.temperature !== undefined) {
		attributes[_ATTR_GEN_AI_REQUEST_TEMPERATURE] = body.temperature;
	}
	if (body.top_p !== undefined) {
		attributes[_ATTR_GEN_AI_REQUEST_TOP_P] = body.top_p;
	}
	if (body.frequency_penalty !== undefined) {
		attributes[_ATTR_GEN_AI_REQUEST_FREQUENCY_PENALTY] = body.frequency_penalty;
	}
	if (body.presence_penalty !== undefined) {
		attributes[_ATTR_GEN_AI_REQUEST_PRESENCE_PENALTY] = body.presence_penalty;
	}

	// Capture request messages
	if (body.${requestMessagesField} && Array.isArray(body.${requestMessagesField})) {
		try {
			attributes[_ATTR_GEN_AI_REQUEST_MESSAGES] = JSON.stringify(body.${requestMessagesField});
		} catch (e) {
			// Ignore serialization errors
		}
	}

	const spanName = body.model ? \`chat \${body.model}\` : 'chat';

	return _otel_tracer.startActiveSpan(spanName, { attributes, kind: _otel_api.SpanKind.CLIENT }, (span) => {
		const result = _original_create.call(this, body, options);

		// Handle streaming responses
		if (body.stream) {
			// Result is a Promise that resolves to a Stream
			if (result && typeof result.then === 'function') {
				return result.then((stream) => {
					return _wrapStream(stream, span, '${inputTokensField}', '${outputTokensField}');
				}).catch((error) => {
					span.setStatus({ code: _otel_api.SpanStatusCode.ERROR, message: error?.message });
					span.recordException(error);
					span.end();
					throw error;
				});
			}
			// Result is already a Stream
			return _wrapStream(result, span, '${inputTokensField}', '${outputTokensField}');
		}

		// Handle non-streaming responses
		if (result && typeof result.then === 'function') {
			return result.then((response) => {
				if (response) {
					if (response.model) {
						span.setAttribute(_ATTR_GEN_AI_RESPONSE_MODEL, response.model);
					}
					if (response.${responseIdField}) {
						span.setAttribute(_ATTR_GEN_AI_RESPONSE_ID, response.${responseIdField});
					}
					if (response.usage) {
						if (response.usage.${inputTokensField} !== undefined) {
							span.setAttribute(_ATTR_GEN_AI_USAGE_INPUT_TOKENS, response.usage.${inputTokensField});
						}
						if (response.usage.${outputTokensField} !== undefined) {
							span.setAttribute(_ATTR_GEN_AI_USAGE_OUTPUT_TOKENS, response.usage.${outputTokensField});
						}
					}
					// Extract finish reason
					const finishReason = ${finishReasonCode};
					if (finishReason) {
						span.setAttribute(_ATTR_GEN_AI_RESPONSE_FINISH_REASONS, JSON.stringify([finishReason]));
					}
					// Extract response content
					const responseContent = ${responseContentCode};
					if (responseContent) {
						span.setAttribute(_ATTR_GEN_AI_RESPONSE_TEXT, responseContent);
					}
				}
				span.setStatus({ code: _otel_api.SpanStatusCode.OK });
				span.end();
				return response;
			}).catch((error) => {
				span.setStatus({ code: _otel_api.SpanStatusCode.ERROR, message: error?.message });
				span.recordException(error);
				span.end();
				throw error;
			});
		}

		span.end();
		return result;
	});
};
`;
}

export function generatePatches(): Map<string, PatchModule> {
	const patches = new Map<string, PatchModule>();

	// OpenAI Chat Completions - patch resources/chat/completions/completions.mjs
	patches.set('openai:otel', {
		module: 'openai',
		filename: 'resources/chat/completions/completions',
		body: {
			after: generateChatCompletionsWrapper({
				provider: 'openai',
				className: 'Completions',
				inputTokensField: 'prompt_tokens',
				outputTokensField: 'completion_tokens',
				responseIdField: 'id',
				finishReasonPath: 'choices[0].finish_reason',
				responseContentPath: 'choices[0].message.content',
				requestMessagesField: 'messages',
				streamDeltaContentPath: 'choices[0].delta.content',
				streamFinishReasonPath: 'choices[0].finish_reason',
				streamUsagePath: 'usage',
			}),
		},
	});

	// Anthropic Messages - patch resources/messages.mjs
	patches.set('@anthropic-ai/sdk:otel', {
		module: '@anthropic-ai/sdk',
		filename: 'resources/messages',
		body: {
			after: generateChatCompletionsWrapper({
				provider: 'anthropic',
				className: 'Messages',
				inputTokensField: 'input_tokens',
				outputTokensField: 'output_tokens',
				responseIdField: 'id',
				finishReasonPath: 'stop_reason',
				responseContentPath: 'content[0].text',
				requestMessagesField: 'messages',
				streamDeltaContentPath: 'delta.text',
				streamFinishReasonPath: 'delta.stop_reason',
				streamUsagePath: 'usage',
			}),
		},
	});

	// Groq Chat Completions - patch resources/chat/completions.mjs
	patches.set('groq-sdk:otel', {
		module: 'groq-sdk',
		filename: 'resources/chat/completions',
		body: {
			after: generateChatCompletionsWrapper({
				provider: 'groq',
				className: 'Completions',
				inputTokensField: 'prompt_tokens',
				outputTokensField: 'completion_tokens',
				responseIdField: 'id',
				finishReasonPath: 'choices[0].finish_reason',
				responseContentPath: 'choices[0].message.content',
				requestMessagesField: 'messages',
				streamDeltaContentPath: 'choices[0].delta.content',
				streamFinishReasonPath: 'choices[0].finish_reason',
				streamUsagePath: 'x_groq.usage',
			}),
		},
	});

	return patches;
}
