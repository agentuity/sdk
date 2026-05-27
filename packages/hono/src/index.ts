/**
 * @agentuity/hono - Agentuity middleware for Hono
 *
 * Provides the `agentuity()` middleware that initializes telemetry and service clients,
 * injecting them into Hono's context variables.
 *
 * @example Basic usage (auto-configured from env vars):
 * ```typescript
 * import { Hono } from 'hono';
 * import { agentuity } from '@agentuity/hono';
 *
 * const app = new Hono();
 * app.use('*', agentuity());
 *
 * app.get('/data', async (c) => {
 *   const { kv, logger } = c.var;
 *   const data = await kv.get('namespace', 'key');
 *   return c.json(data);
 * });
 * ```
 */

import { createMiddleware } from 'hono/factory';
import type { Env, MiddlewareHandler } from 'hono';
import {
	register,
	type TelemetryConfig,
	type TelemetryResponse,
	type Logger,
} from '@agentuity/telemetry';
import { KeyValueClient, type KeyValueClientOptions } from '@agentuity/keyvalue';
import { VectorClient, type VectorClientOptions } from '@agentuity/vector';
import { StreamClient, type StreamClientOptions } from '@agentuity/stream';
import { QueueClient, type QueueClientOptions } from '@agentuity/queue';
import { EmailClient, type EmailClientOptions } from '@agentuity/email';
import { TaskClient, type TaskClientOptions } from '@agentuity/task';
import { ScheduleClient, type ScheduleClientOptions } from '@agentuity/schedule';
import { SandboxClient, type SandboxClientOptions } from '@agentuity/sandbox';

export interface ServicesConfig {
	/** Logger instance */
	logger?: Logger;
	/** Service client options */
	clients?: {
		kv?: KeyValueClientOptions;
		vector?: VectorClientOptions;
		stream?: StreamClientOptions;
		queue?: QueueClientOptions;
		email?: EmailClientOptions;
		task?: TaskClientOptions;
		schedule?: ScheduleClientOptions;
		sandbox?: SandboxClientOptions;
	};
}

export interface Services {
	kv: KeyValueClient;
	stream: StreamClient;
	vector: VectorClient;
	sandbox: SandboxClient;
	queue: QueueClient;
	email: EmailClient;
	schedule: ScheduleClient;
	task: TaskClient;
}

export interface AgentuityOptions {
	/** Telemetry configuration overrides */
	telemetry?: Partial<TelemetryConfig>;
	/** Services configuration */
	services?: ServicesConfig;
}

// Global state (initialized once at composition time)
let telemetryInstance: TelemetryResponse | null = null;
let globalServices: Services | null = null;

/**
 * Initialize service clients.
 */
function initServices(config?: ServicesConfig): Services {
	if (globalServices) return globalServices;

	globalServices = {
		kv: new KeyValueClient({ logger: config?.logger, ...config?.clients?.kv }),
		stream: new StreamClient({ logger: config?.logger, ...config?.clients?.stream }),
		vector: new VectorClient({ logger: config?.logger, ...config?.clients?.vector }),
		queue: new QueueClient({ logger: config?.logger, ...config?.clients?.queue }),
		email: new EmailClient({ logger: config?.logger, ...config?.clients?.email }),
		task: new TaskClient({ logger: config?.logger, ...config?.clients?.task }),
		schedule: new ScheduleClient({ logger: config?.logger, ...config?.clients?.schedule }),
		sandbox: new SandboxClient({ logger: config?.logger, ...config?.clients?.sandbox }),
	};

	return globalServices;
}

/**
 * Get initialized services. Throws if not initialized.
 */
export function getServices(): Services {
	if (!globalServices) {
		throw new Error('Services not initialized. Call agentuity() first.');
	}
	return globalServices;
}

/**
 * Reset global state (for testing).
 */
export function resetServices(): void {
	globalServices = null;
}

/**
 * Create the Agentuity middleware for Hono.
 *
 * Initializes telemetry and services at middleware composition time,
 * making them available via Hono's context variables.
 *
 * Telemetry auto-configures from AGENTUITY_* environment variables.
 * Services auto-configure from AGENTUITY_SDK_KEY.
 */
export function agentuity<E extends Env = any, P extends string = any>(
	options?: AgentuityOptions
): MiddlewareHandler<E, P> {
	// Initialize telemetry (auto-configures from env vars)
	if (!telemetryInstance) {
		telemetryInstance = register(options?.telemetry);
	}

	// Initialize services
	initServices({
		logger: telemetryInstance.logger,
		...options?.services,
	});

	// Return the middleware handler
	return createMiddleware<E, P>(async (c, next) => {
		// The middleware is path-agnostic, but Hono types `c.set()` from the
		// consuming app's Variables map. Set by string here so typed apps can
		// choose the subset of Agentuity variables they want to expose.
		const setVar = c.set as (key: string, value: unknown) => void;

		// Inject telemetry into context
		setVar('tracer', telemetryInstance!.tracer);
		setVar('logger', telemetryInstance!.logger);
		setVar('meter', telemetryInstance!.meter);

		// Inject services into context
		const services = getServices();
		setVar('kv', services.kv);
		setVar('stream', services.stream);
		setVar('vector', services.vector);
		setVar('queue', services.queue);
		setVar('email', services.email);
		setVar('schedule', services.schedule);
		setVar('task', services.task);
		setVar('sandbox', services.sandbox);

		await next();
	});
}

/**
 * Get the telemetry instance. Available after agentuity() is composed.
 */
export function getTelemetry(): TelemetryResponse | null {
	return telemetryInstance;
}

/**
 * Reset global state (for testing).
 */
export function reset(): void {
	telemetryInstance = null;
	resetServices();
}

// Re-export types
export type { TelemetryConfig, TelemetryResponse, Logger } from '@agentuity/telemetry';
