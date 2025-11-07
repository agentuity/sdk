import { context, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import {
	KeyValueStorageService,
	ObjectStorageService,
	StreamStorageService,
	VectorStorageService,
	type KeyValueStorage,
	type ObjectStorage,
	type StreamStorage,
	type VectorStorage,
	type ListStreamsResponse,
	type VectorUpsertResult,
	type VectorSearchResult,
	type Logger,
} from '@agentuity/core';
import { createServerFetchAdapter, getServiceUrls } from '@agentuity/server';
import { injectTraceContextToHeaders } from './otel/http';
import { getLogger, getTracer } from './_server';
import { getSDKVersion, isAuthenticated } from './_config';
import type { AppConfig } from './app';
import {
	DefaultSessionProvider,
	DefaultThreadProvider,
	type ThreadProvider,
	type SessionProvider,
} from './session';
import {
	LocalKeyValueStorage,
	LocalObjectStorage,
	LocalStreamStorage,
	LocalVectorStorage,
	getLocalDB,
	normalizeProjectPath,
	createLocalStorageRouter,
} from './services/local';

const userAgent = `Agentuity SDK/${getSDKVersion()}`;
const bearerKey = `Bearer ${process.env.AGENTUITY_SDK_KEY}`;

const serviceUrls = getServiceUrls();
const kvBaseUrl = serviceUrls.keyvalue;
const streamBaseUrl = serviceUrls.stream;
const vectorBaseUrl = serviceUrls.vector;
const objectBaseUrl = serviceUrls.objectstore;

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

let kv: KeyValueStorage;
let objectStore: ObjectStorage;
let stream: StreamStorage;
let vector: VectorStorage;
let session: SessionProvider;
let thread: ThreadProvider;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let localRouter: any | null = null;

export function createServices(logger: Logger, config?: AppConfig, serverUrl?: string) {
	const authenticated = isAuthenticated();
	const useLocal = config?.services?.useLocal ?? false;

	// Use local services if explicitly requested OR if not authenticated
	const shouldUseLocal =
		useLocal || !authenticated || process.env.AGENTUITY_FORCE_LOCAL_SERVICES === 'true';

	if (shouldUseLocal) {
		const db = getLocalDB();
		const projectPath = normalizeProjectPath();

		if (!serverUrl) {
			throw new Error('serverUrl is required when using local services');
		}

		logger.info('Using local services (development only)');

		kv = config?.services?.keyvalue || new LocalKeyValueStorage(db, projectPath);
		objectStore = config?.services?.object || new LocalObjectStorage(db, projectPath, serverUrl);
		stream = config?.services?.stream || new LocalStreamStorage(db, projectPath, serverUrl);
		vector = config?.services?.vector || new LocalVectorStorage(db, projectPath);
		session = config?.services?.session || new DefaultSessionProvider();
		thread = config?.services?.thread || new DefaultThreadProvider();

		localRouter = createLocalStorageRouter(db, projectPath);

		return { localRouter };
	}

	// Reset local router if not using local services
	localRouter = null;

	// At this point we must be authenticated (since !authenticated would trigger local services above)
	kv = config?.services?.keyvalue || new KeyValueStorageService(kvBaseUrl, adapter);
	objectStore = config?.services?.object || new ObjectStorageService(objectBaseUrl, adapter);
	stream = config?.services?.stream || new StreamStorageService(streamBaseUrl, adapter);
	vector = config?.services?.vector || new VectorStorageService(vectorBaseUrl, adapter);
	session = config?.services?.session || new DefaultSessionProvider();
	thread = config?.services?.thread || new DefaultThreadProvider();

	return {};
}

export function getThreadProvider(): ThreadProvider {
	return thread;
}

export function getSessionProvider(): SessionProvider {
	return session;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getLocalRouter(): any | null {
	return localRouter;
}

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
