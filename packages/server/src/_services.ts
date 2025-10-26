import { context, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import { createServerFetchAdapter, KeyValueStorageService } from '@agentuity/core';
import { injectTraceContextToHeaders } from './otel/http';
import { getLogger, getTracer } from './_server';

const sdkKey = process.env.AGENTUITY_SDK_KEY;
const baseUrl =
	process.env.AGENTUITY_KEYVALUE_URL ||
	process.env.AGENTUITY_TRANSPORT_URL ||
	'https://agentuity.ai';

const adapter = createServerFetchAdapter({
	headers: {
		Authorization: `Bearer ${sdkKey}`,
	},
	onBefore: async (url, options, callback) => {
		getLogger()?.debug('before request: %s with options: %s', url, options);
		if (!options.telemetry) {
			return callback();
		}
		options.headers = { ...options.headers, ...injectTraceContextToHeaders() };
		const tracer = getTracer() ?? trace.getTracer('agentuity');
		const currentContext = context.active();
		const span = tracer.startSpan(
			options.telemetry.name,
			{ attributes: options.telemetry.attributes, kind: SpanKind.CLIENT },
			currentContext
		);
		const spanContext = trace.setSpan(currentContext, span);
		try {
			await context.with(spanContext, callback);
		} catch (err) {
			const e = err as Error;
			span.recordException(e);
			span.setStatus({ code: SpanStatusCode.ERROR, message: e?.message ?? String(err) });
			throw err;
		} finally {
			span.end();
		}
	},
	onAfter: async (response, err) => {
		getLogger()?.debug('after request: %s (%d) => %s', response.url, response.status, err);
	},
});

const kv = new KeyValueStorageService(baseUrl, adapter);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerServices(o: any) {
	Object.defineProperty(o, 'kv', {
		get: () => kv,
		enumerable: false,
		configurable: false,
	});
}
