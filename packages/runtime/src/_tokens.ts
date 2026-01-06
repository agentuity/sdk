import type { Context, AttributeValue } from '@opentelemetry/api';
import type { Span } from '@opentelemetry/sdk-trace-base';
import type { SpanProcessor } from '@opentelemetry/sdk-trace-base';
import { inAgentContext, inHTTPContext, getHTTPContext } from './_context';
import { SpanAttributes } from '@traceloop/ai-semantic-conventions';

export const TOKENS_HEADER = 'x-agentuity-tokens';
export const DURATION_HEADER = 'x-agentuity-duration';

// AI SDK span names: ai.generateText, ai.streamText, ai.generateObject, ai.streamObject, ai.embed, ai.embedMany
const AI_SDK_SPAN_PREFIX = 'ai.';
const AI_SDK_MODEL_NAME = 'ai.model.id';
const AI_SDK_USAGE_PROMPT_TOKENS = 'ai.usage.promptTokens';
const AI_SDK_USAGE_COMPLETION_TOKENS = 'ai.usage.completionTokens';

const parseTokenHeader = (val: string | undefined): Map<string, number> => {
	const kv = new Map<string, number>();
	if (val) {
		// format is: [model]:[count] [model:count]
		const tok = val.split(' ');
		for (const entry of tok) {
			const [name, count] = entry.split(':');
			if (name) {
				kv.set(name, parseInt(count ?? '0') ?? 0);
			}
		}
	}
	return kv;
};

const serializeTokenHeader = (kv: Map<string, number>): string => {
	const lines: string[] = [];
	for (const [k, v] of kv) {
		lines.push(`${k}:${v}`);
	}
	return lines.join(' ');
};

const getTokenValue = (val: AttributeValue | undefined): number => {
	if (val) {
		const v = val.valueOf();
		switch (typeof v) {
			case 'number':
				return v;
			case 'string':
				return parseInt(v, 10);
			default:
		}
	}
	return 0;
};

export class TokenSpanProcessor implements SpanProcessor {
	onStart(_span: Span, _context: Context) {
		return;
	}

	onEnd(span: Span) {
		if (inAgentContext() && inHTTPContext()) {
			const ctx = getHTTPContext();
			const tokenLine = ctx.res.headers.get(TOKENS_HEADER) ?? undefined;
			const tokens = parseTokenHeader(tokenLine);
			let mutated = false;
			// AI SDK uses ai.* span names but doesn't use the semantic attribute names
			if (span.name.startsWith(AI_SDK_SPAN_PREFIX) && AI_SDK_MODEL_NAME in span.attributes) {
				const model = span.attributes[AI_SDK_MODEL_NAME]!.toString();
				let totalTokens = tokens.get(model) ?? 0;
				if (AI_SDK_USAGE_PROMPT_TOKENS in span.attributes) {
					totalTokens += getTokenValue(span.attributes[AI_SDK_USAGE_PROMPT_TOKENS]);
				}
				if (AI_SDK_USAGE_COMPLETION_TOKENS in span.attributes) {
					totalTokens += getTokenValue(span.attributes[AI_SDK_USAGE_COMPLETION_TOKENS]);
				}
				if (totalTokens > 0) {
					tokens.set(model, totalTokens);
					mutated = true;
				}
			} else if (
				SpanAttributes.LLM_SYSTEM in span.attributes &&
				SpanAttributes.LLM_RESPONSE_MODEL in span.attributes
			) {
				const model = span.attributes[SpanAttributes.LLM_RESPONSE_MODEL]!.toString();
				let totalTokens = tokens.get(model) ?? 0;
				if (SpanAttributes.LLM_USAGE_PROMPT_TOKENS in span.attributes) {
					totalTokens += getTokenValue(
						span.attributes[SpanAttributes.LLM_USAGE_PROMPT_TOKENS]
					);
				}
				if (SpanAttributes.LLM_USAGE_COMPLETION_TOKENS in span.attributes) {
					totalTokens += getTokenValue(
						span.attributes[SpanAttributes.LLM_USAGE_COMPLETION_TOKENS]
					);
				}
				if (totalTokens > 0) {
					tokens.set(model, totalTokens);
					mutated = true;
				}
			}
			if (mutated) {
				ctx.header(TOKENS_HEADER, serializeTokenHeader(tokens));
			}
		}
	}

	forceFlush() {
		return Promise.resolve();
	}

	shutdown() {
		return Promise.resolve();
	}
}
