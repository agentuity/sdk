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

// Process-global state (survives bun --hot module re-evaluation)
const telemetryInstanceKey = Symbol.for('@agentuity/hono:telemetry');
const servicesInstanceKey = Symbol.for('@agentuity/hono:services');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;

function getTelemetryInstance(): TelemetryResponse | null {
	return (g[telemetryInstanceKey] as TelemetryResponse | undefined) ?? null;
}

function setTelemetryInstance(value: TelemetryResponse | null): void {
	g[telemetryInstanceKey] = value;
}

function getGlobalServices(): Services | null {
	return (g[servicesInstanceKey] as Services | undefined) ?? null;
}

function setGlobalServices(value: Services | null): void {
	g[servicesInstanceKey] = value;
}

/**
 * Initialize service clients.
 */
function initServices(config?: ServicesConfig): Services {
	const existing = getGlobalServices();
	if (existing) return existing;

	const services: Services = {
		kv: new KeyValueClient({ logger: config?.logger, ...config?.clients?.kv }),
		stream: new StreamClient({ logger: config?.logger, ...config?.clients?.stream }),
		vector: new VectorClient({ logger: config?.logger, ...config?.clients?.vector }),
		queue: new QueueClient({ logger: config?.logger, ...config?.clients?.queue }),
		email: new EmailClient({ logger: config?.logger, ...config?.clients?.email }),
		task: new TaskClient({ logger: config?.logger, ...config?.clients?.task }),
		schedule: new ScheduleClient({ logger: config?.logger, ...config?.clients?.schedule }),
		sandbox: new SandboxClient({ logger: config?.logger, ...config?.clients?.sandbox }),
	};
	setGlobalServices(services);
	return services;
}

/**
 * Get initialized services. Throws if not initialized.
 */
export function getServices(): Services {
	const services = getGlobalServices();
	if (!services) {
		throw new Error('Services not initialized. Call agentuity() first.');
	}
	return services;
}

/**
 * Reset global state (for testing).
 */
export function resetServices(): void {
	setGlobalServices(null);
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
	// Initialize telemetry (auto-configures from env vars).
	// Stored on globalThis so bun --hot does not re-register and re-patch console.
	let telemetryInstance = getTelemetryInstance();
	if (!telemetryInstance) {
		telemetryInstance = register(options?.telemetry);
		setTelemetryInstance(telemetryInstance);
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

		const activeTelemetry = getTelemetryInstance() ?? telemetryInstance;

		// Inject telemetry into context
		setVar('tracer', activeTelemetry.tracer);
		setVar('logger', activeTelemetry.logger);
		setVar('meter', activeTelemetry.meter);

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
	return getTelemetryInstance();
}

/**
 * Reset global state (for testing).
 */
export function reset(): void {
	setTelemetryInstance(null);
	resetServices();
}

// Re-export types
export type { TelemetryConfig, TelemetryResponse, Logger } from '@agentuity/telemetry';
