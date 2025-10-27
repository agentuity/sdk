import { context, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import {
	createServerFetchAdapter,
	KeyValueStorageService,
	ObjectStorageService,
	StreamStorageService,
	VectorStorageService,
	ListStreamsResponse,
	VectorUpsertResult,
	VectorSearchResult,
} from '@agentuity/core';
import { injectTraceContextToHeaders } from './otel/http';
import { getLogger, getTracer } from './_server';
import { getSDKVersion } from './_config';

const userAgent = `Agentuity SDK/${getSDKVersion()}`;
const bearerKey = `Bearer ${process.env.AGENTUITY_SDK_KEY}`;

const kvBaseUrl =
	process.env.AGENTUITY_KEYVALUE_URL ||
	process.env.AGENTUITY_TRANSPORT_URL ||
	'https://agentuity.ai';

const streamBaseUrl = process.env.AGENTUITY_STREAM_URL || 'https://streams.agentuity.cloud';

const vectorBaseUrl =
	process.env.AGENTUITY_VECTOR_URL ||
	process.env.AGENTUITY_TRANSPORT_URL ||
	'https://agentuity.ai';

const objectBaseUrl =
	process.env.AGENTUITY_OBJECTSTORE_URL ||
	process.env.AGENTUITY_TRANSPORT_URL ||
	'https://agentuity.ai';

const adapter = createServerFetchAdapter({
	headers: {
		Authorization: bearerKey,
		'User-Agent': userAgent,
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
			span.setStatus({ code: SpanStatusCode.OK });
		} catch (err) {
			const e = err as Error;
			span.recordException(e);
			span.setStatus({ code: SpanStatusCode.ERROR, message: e?.message ?? String(err) });
			throw err;
		} finally {
			span.end();
		}
	},
	onAfter: async (url, options, result, err) => {
		getLogger()?.debug('after request: %s (%d) => %s', url, result.response.status, err);
		if (err) {
			return;
		}
		const span = trace.getSpan(context.active());
		switch (options.telemetry?.name) {
			case 'agentuity.keyvalue.get': {
				if (result.response.status === 404) {
					span?.addEvent('miss');
				} else if (result.response.ok) {
					span?.addEvent('hit');
				}
				break;
			}
			case 'agentuity.stream.create': {
				if (result.response.ok) {
					const res = result.data as { id: string };
					span?.setAttributes({
						'stream.id': res.id,
						'stream.url': `${streamBaseUrl}/${res.id}`,
					});
				}
				break;
			}
			case 'agentuity.stream.list': {
				const response = result.data as ListStreamsResponse;
				if (response && span) {
					span.setAttributes({
						'stream.count': response.streams.length,
						'stream.total': response.total,
					});
				}
				break;
			}
			case 'agentuity.vector.upsert': {
				if (result.response.ok) {
					const data = result.data as VectorUpsertResult[];
					span?.setAttributes({
						'vector.count': data.length,
					});
				}
				break;
			}
			case 'agentuity.vector.search': {
				if (result.response.ok) {
					const data = result.data as VectorSearchResult[];
					span?.setAttributes({
						'vector.results': data.length,
					});
				}
				break;
			}
			case 'agentuity.vector.get': {
				if (result.response.status === 404) {
					span?.addEvent('miss');
				} else if (result.response.ok) {
					span?.addEvent('hit');
				}
				break;
			}
			case 'agentuity.objectstore.get': {
				if (result.response.status === 404) {
					span?.addEvent('miss');
				} else if (result.response.ok) {
					span?.addEvent('hit');
				}
				break;
			}
			case 'agentuity.objectstore.delete': {
				if (result.response.status === 404) {
					span?.addEvent('not_found', { deleted: false });
				} else if (result.response.ok) {
					span?.addEvent('deleted', { deleted: true });
				}
				break;
			}
		}
	},
});

const kv = new KeyValueStorageService(kvBaseUrl, adapter);
const objectStore = new ObjectStorageService(objectBaseUrl, adapter);
const stream = new StreamStorageService(streamBaseUrl, adapter);
const vector = new VectorStorageService(vectorBaseUrl, adapter);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerServices(o: any) {
	Object.defineProperty(o, 'kv', {
		get: () => kv,
		enumerable: false,
		configurable: false,
	});
	Object.defineProperty(o, 'objectstore', {
		get: () => objectStore,
		enumerable: false,
		configurable: false,
	});
	Object.defineProperty(o, 'stream', {
		get: () => stream,
		enumerable: false,
		configurable: false,
	});
	Object.defineProperty(o, 'vector', {
		get: () => vector,
		enumerable: false,
		configurable: false,
	});
}
