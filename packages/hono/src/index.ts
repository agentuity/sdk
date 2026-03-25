/**
 * @agentuity/hono - Agentuity middleware for Hono
 *
 * Provides the `agentuity()` middleware that initializes analytics and service clients,
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
import {
	register,
	type AnalyticsConfig,
	type AnalyticsResponse,
	type Logger,
} from '@agentuity/analytics';
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
	/** Analytics configuration overrides */
	analytics?: Partial<AnalyticsConfig>;
	/** Services configuration */
	services?: ServicesConfig;
}

// Global state (initialized once at composition time)
let analyticsInstance: AnalyticsResponse | null = null;
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
 * Initializes analytics and services at middleware composition time,
 * making them available via Hono's context variables.
 *
 * Analytics auto-configures from AGENTUITY_* environment variables.
 * Services auto-configure from AGENTUITY_SDK_KEY.
 */
export function agentuity(options?: AgentuityOptions) {
	// Initialize analytics (auto-configures from env vars)
	if (!analyticsInstance) {
		analyticsInstance = register(options?.analytics);
	}

	// Initialize services
	initServices({
		logger: analyticsInstance.logger,
		...options?.services,
	});

	// Return the middleware handler
	return createMiddleware(async (c, next) => {
		// Inject analytics into context
		c.set('tracer', analyticsInstance!.tracer as any);
		c.set('logger', analyticsInstance!.logger as any);
		c.set('meter', analyticsInstance!.meter as any);

		// Inject services into context
		const services = getServices();
		c.set('kv', services.kv as any);
		c.set('stream', services.stream as any);
		c.set('vector', services.vector as any);
		c.set('queue', services.queue as any);
		c.set('email', services.email as any);
		c.set('schedule', services.schedule as any);
		c.set('task', services.task as any);
		c.set('sandbox', services.sandbox as any);

		await next();
	});
}

/**
 * Get the analytics instance. Available after agentuity() is composed.
 */
export function getAnalytics(): AnalyticsResponse | null {
	return analyticsInstance;
}

/**
 * Reset global state (for testing).
 */
export function reset(): void {
	analyticsInstance = null;
	resetServices();
}

// Re-export types
export type { AnalyticsConfig, AnalyticsResponse, Logger } from '@agentuity/analytics';
