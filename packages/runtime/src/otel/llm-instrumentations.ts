import { OpenAIInstrumentation } from '@traceloop/instrumentation-openai';
import { AnthropicInstrumentation } from '@traceloop/instrumentation-anthropic';
import { BedrockInstrumentation } from '@traceloop/instrumentation-bedrock';
import { CohereInstrumentation } from '@traceloop/instrumentation-cohere';
import { VertexAIInstrumentation } from '@traceloop/instrumentation-vertexai';

/**
 * Creates traceloop LLM instrumentations for OpenTelemetry.
 * These instrumentations capture traces for LLM provider calls (OpenAI, Anthropic, etc.)
 */
export function createLLMInstrumentations() {
	const exceptionLogger = (e: Error) => {
		console.debug('[Traceloop] Instrumentation exception:', e.message);
	};

	const enrichTokens = (process.env.TRACELOOP_ENRICH_TOKENS || 'true').toLowerCase() === 'true';

	return [
		new OpenAIInstrumentation({
			enrichTokens,
			exceptionLogger,
		}),
		new AnthropicInstrumentation({
			exceptionLogger,
		}),
		new BedrockInstrumentation({
			exceptionLogger,
		}),
		new CohereInstrumentation({
			exceptionLogger,
		}),
		new VertexAIInstrumentation({
			exceptionLogger,
		}),
	];
}
