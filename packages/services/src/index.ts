/**
 * @agentuity/services - Agentuity cloud services
 *
 * Provides storage, compute, and communication services.
 */

import {
	KeyValueStorageService,
	StreamStorageService,
	VectorStorageService,
	QueueStorageService,
	EmailStorageService,
	ScheduleService,
	TaskStorageService,
	type KeyValueStorage,
	type StreamStorage,
	type VectorStorage,
	type SandboxService,
	type QueueService,
	type EmailService,
	type TaskStorage,
	type Logger,
} from '@agentuity/core';
import { createServerFetchAdapter, getServiceUrls } from '@agentuity/server';
import type { Tracer } from '@opentelemetry/api';

export interface ServicesConfig {
	sdkKey?: string;
	region?: string;
	logger?: Logger;
	tracer?: Tracer;
	// Service overrides
	services?: {
		kv?: KeyValueStorage;
		stream?: StreamStorage;
		vector?: VectorStorage;
		sandbox?: SandboxService;
		queue?: QueueService;
		email?: EmailService;
		task?: TaskStorage;
	};
}

export interface Services {
	kv: KeyValueStorage;
	stream: StreamStorage;
	vector: VectorStorage;
	sandbox: SandboxService;
	queue: QueueService;
	email: EmailService;
	schedule: ScheduleService;
	task: TaskStorage;
}

let globalServices: Services | null = null;

/**
 * Initialize services. Can be called multiple times - returns existing instance.
 */
export function initServices(config?: ServicesConfig): Services {
	if (globalServices) return globalServices;

	const sdkKey = config?.sdkKey ?? process.env.AGENTUITY_SDK_KEY;
	const region = config?.region ?? process.env.AGENTUITY_REGION ?? 'usc';
	const logger = config?.logger ?? defaultLogger;

	const urls = getServiceUrls(region);

	// Create fetch adapter with optional OTel tracing
	const adapter = createServerFetchAdapter(
		{
			headers: {
				Authorization: `Bearer ${sdkKey}`,
				'User-Agent': `Agentuity SDK`,
			},
			...(config?.tracer && {
				onBefore: async (_url, options, callback) => {
					if (!options.telemetry) {
						return callback();
					}
					// OTel tracing would happen here
					return callback();
				},
			}),
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
		sandbox: undefined as unknown as SandboxService, // TODO: HTTPSandboxService
		schedule: new ScheduleService(urls.catalyst, adapter),
	};

	return globalServices;
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
 * Console logger wrapper that satisfies Logger interface.
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
	child(_opts: Record<string, unknown>): Logger {
		return this; // Simple implementation
	}
}

const defaultLogger = new ConsoleLogger();

// Named exports via Proxy (lazy access)
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
