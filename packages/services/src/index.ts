/**
 * @agentuity/services - Agentuity cloud services
 *
 * Provides storage, compute, and communication services.
 * Initializes cloud services by default when AGENTUITY_SDK_KEY is present.
 * Supports service overrides via configuration.
 */

import {
	KeyValueStorageService,
	StreamStorageService,
	VectorStorageService,
	QueueStorageService,
	EmailStorageService,
	ScheduleService,
	TaskStorageService,
	type FetchAdapter,
	type KeyValueStorage,
	type StreamStorage,
	type VectorStorage,
	type SandboxService,
	type QueueService,
	type EmailService,
	type TaskStorage,
	type Logger,
	type SessionEventProvider,
	type EvalRunEventProvider,
} from '@agentuity/core';
import { createServerFetchAdapter, getServiceUrls } from '@agentuity/server';
import type { Tracer } from '@opentelemetry/api';

// Event providers
export * from './events';

export interface Services {
	kv: KeyValueStorage;
	stream: StreamStorage;
	vector: VectorStorage;
	sandbox: SandboxService;
	queue: QueueService;
	email: EmailService;
	schedule: ScheduleService;
	task: TaskStorage;
	sessionEvent?: SessionEventProvider;
	evalRunEvent?: EvalRunEventProvider;
}

export interface ServicesConfig {
	/** SDK key (defaults to AGENTUITY_SDK_KEY env) */
	sdkKey?: string;
	/** Region (defaults to AGENTUITY_REGION env or 'usc') */
	region?: string;
	/** Logger instance */
	logger?: Logger;
	/** Tracer for OTel instrumentation */
	tracer?: Tracer;
	/** Custom fetch adapter (overrides default) */
	adapter?: FetchAdapter;
	/** Server URL for local services */
	serverUrl?: string;
	/** Force local services (ignores SDK key) */
	useLocal?: boolean;
	/** Service overrides */
	services?: {
		kv?: KeyValueStorage;
		stream?: StreamStorage;
		vector?: VectorStorage;
		sandbox?: SandboxService;
		queue?: QueueService;
		email?: EmailService;
		task?: TaskStorage;
		sessionEvent?: SessionEventProvider;
		evalRunEvent?: EvalRunEventProvider;
	};
}

let globalServices: Services | null = null;

/**
 * Initialize services. Can be called multiple times - returns existing instance.
 *
 * Cloud services are initialized by default when AGENTUITY_SDK_KEY is present.
 * Falls back to local services when no SDK key (requires Bun runtime).
 * Pass service overrides in config.services to customize.
 */
export function initServices(config?: ServicesConfig): Services {
	if (globalServices) return globalServices;

	const sdkKey = config?.sdkKey ?? process.env.AGENTUITY_SDK_KEY ?? '';
	const region = config?.region ?? process.env.AGENTUITY_REGION ?? 'usc';
	const logger = config?.logger ?? createDefaultLogger();
	const useLocal = config?.useLocal ?? !sdkKey;

	const urls = getServiceUrls(region);

	// Use local services if no SDK key or explicitly requested
	if (useLocal) {
		return initLocalServices(config, logger);
	}

	// Cloud services
	const adapter =
		config?.adapter ??
		createServerFetchAdapter(
			{
				headers: {
					Authorization: `Bearer ${sdkKey}`,
					'User-Agent': 'Agentuity SDK',
				},
			},
			logger
		);

	globalServices = {
		kv: config?.services?.kv ?? new KeyValueStorageService(urls.keyvalue, adapter),
		stream: config?.services?.stream ?? new StreamStorageService(urls.stream, adapter),
		vector: config?.services?.vector ?? new VectorStorageService(urls.vector, adapter),
		queue: config?.services?.queue ?? new QueueStorageService(urls.catalyst, adapter),
		email: config?.services?.email ?? new EmailStorageService(urls.email, adapter),
		task: config?.services?.task ?? new TaskStorageService(urls.catalyst, adapter),
		schedule: new ScheduleService(urls.catalyst, adapter),
		sandbox: config?.services?.sandbox ?? (undefined as unknown as SandboxService),
		sessionEvent: config?.services?.sessionEvent,
		evalRunEvent: config?.services?.evalRunEvent,
	};

	return globalServices;
}

/**
 * Initialize local services (Bun runtime only)
 */
function initLocalServices(config: ServicesConfig | undefined, logger: Logger): Services {
	// Dynamic import to avoid errors in non-Bun environments
	try {
		const {
			isLocalAvailable,
			getLocalDB,
			LocalKeyValueStorage,
			LocalStreamStorage,
			LocalVectorStorage,
			LocalQueueStorage,
			LocalEmailStorage,
			LocalTaskStorage,
			normalizeProjectPath,
		} = require('@agentuity/local');

		if (!isLocalAvailable()) {
			logger.warn(
				'Local services requested but runtime does not support them. Using no-op services.'
			);
			return createNoOpServices(config);
		}

		const db = getLocalDB();
		const projectPath = normalizeProjectPath();
		const serverUrl = config?.serverUrl ?? `http://localhost:${process.env.PORT ?? 3500}`;

		logger.info('Using local services (development mode)');

		globalServices = {
			kv: config?.services?.kv ?? new LocalKeyValueStorage(db, projectPath),
			stream: config?.services?.stream ?? new LocalStreamStorage(db, projectPath, serverUrl),
			vector: config?.services?.vector ?? new LocalVectorStorage(db, projectPath),
			queue: new LocalQueueStorage(db, projectPath),
			email: config?.services?.email ?? new LocalEmailStorage(),
			task: config?.services?.task ?? new LocalTaskStorage(db, projectPath),
			schedule: undefined as unknown as ScheduleService,
			sandbox: undefined as unknown as SandboxService,
			sessionEvent: config?.services?.sessionEvent,
			evalRunEvent: config?.services?.evalRunEvent,
		};

		return globalServices;
	} catch {
		logger.warn('Failed to load local services. Using no-op services.');
		return createNoOpServices(config);
	}
}

/**
 * Create no-op services for unsupported environments
 */
function createNoOpServices(config: ServicesConfig | undefined): Services {
	return {
		kv: config?.services?.kv ?? createNoOpKV(),
		stream: config?.services?.stream ?? createNoOpStream(),
		vector: config?.services?.vector ?? createNoOpVector(),
		queue: config?.services?.queue ?? createNoOpQueue(),
		email: config?.services?.email ?? createNoOpEmail(),
		task: config?.services?.task ?? createNoOpTask(),
		schedule: undefined as unknown as ScheduleService,
		sandbox: undefined as unknown as SandboxService,
		sessionEvent: config?.services?.sessionEvent,
		evalRunEvent: config?.services?.evalRunEvent,
	};
}

// No-op implementations
function createNoOpKV(): KeyValueStorage {
	return {
		get: async () => ({ exists: false, data: undefined }) as any,
		set: async () => {},
		delete: async () => {},
		getStats: async () => {
			throw new Error('Not implemented');
		},
		getAllStats: async () => {
			throw new Error('Not implemented');
		},
		getNamespaces: async () => [],
		search: async () => ({}),
		getKeys: async () => [],
		deleteNamespace: async () => {},
		createNamespace: async () => {},
	} as KeyValueStorage;
}

function createNoOpStream(): StreamStorage {
	return { notImplemented: true } as unknown as StreamStorage;
}

function createNoOpVector(): VectorStorage {
	return { notImplemented: true } as unknown as VectorStorage;
}

function createNoOpQueue(): QueueService {
	return { notImplemented: true } as unknown as QueueService;
}

function createNoOpEmail(): EmailService {
	return { notImplemented: true } as unknown as EmailService;
}

function createNoOpTask(): TaskStorage {
	return { notImplemented: true } as unknown as TaskStorage;
}

/**
 * Get initialized services. Throws if not initialized.
 */
export function getServices(): Services {
	if (!globalServices) {
		throw new Error('Services not initialized. Call initServices() first.');
	}
	return globalServices;
}

/**
 * Reset services (for testing).
 */
export function resetServices(): void {
	globalServices = null;
}

/**
 * Console logger that satisfies Logger interface.
 */
class ConsoleLogger implements Logger {
	trace(message: unknown, ...args: unknown[]): void {
		console.debug(message, ...args);
	}
	debug(message: unknown, ...args: unknown[]): void {
		console.debug(message, ...args);
	}
	info(message: unknown, ...args: unknown[]): void {
		console.info(message, ...args);
	}
	warn(message: unknown, ...args: unknown[]): void {
		console.warn(message, ...args);
	}
	error(message: unknown, ...args: unknown[]): void {
		console.error(message, ...args);
	}
	fatal(message: unknown, ...args: unknown[]): never {
		console.error(message, ...args);
		process.exit(1);
	}
	child(): Logger {
		return this;
	}
}

function createDefaultLogger(): Logger {
	return new ConsoleLogger();
}

// Named exports via Proxy (lazy access - throws if not initialized)
export const kv: KeyValueStorage = new Proxy({} as KeyValueStorage, {
	get: (_, prop) => getServices().kv[prop as keyof KeyValueStorage],
});

export const stream: StreamStorage = new Proxy({} as StreamStorage, {
	get: (_, prop) => getServices().stream[prop as keyof StreamStorage],
});

export const vector: VectorStorage = new Proxy({} as VectorStorage, {
	get: (_, prop) => getServices().vector[prop as keyof VectorStorage],
});

export const queue: QueueService = new Proxy({} as QueueService, {
	get: (_, prop) => getServices().queue[prop as keyof QueueService],
});

export const email: EmailService = new Proxy({} as EmailService, {
	get: (_, prop) => getServices().email[prop as keyof EmailService],
});

export const task: TaskStorage = new Proxy({} as TaskStorage, {
	get: (_, prop) => getServices().task[prop as keyof TaskStorage],
});

export const schedule: ScheduleService = new Proxy({} as ScheduleService, {
	get: (_, prop) => getServices().schedule[prop as keyof ScheduleService],
});
