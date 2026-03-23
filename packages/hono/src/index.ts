/**
 * @agentuity/hono - Agentuity middleware for Hono
 *
 * Provides the `agentuity()` middleware that initializes OTel and services,
 * injecting them into Hono's context variables.
 *
 * @example Basic usage (cloud services auto-initialized):
 * ```typescript
 * import { Hono } from 'hono';
 * import { agentuity } from '@agentuity/hono';
 *
 * const app = new Hono();
 * app.use('*', agentuity());
 *
 * app.get('/data', async (c) => {
 *   const { kv, logger } = c.var;
 *   const data = await kv.get('key');
 *   return c.json(data);
 * });
 * ```
 *
 * @example With service overrides:
 * ```typescript
 * import { Hono } from 'hono';
 * import { agentuity } from '@agentuity/hono';
 * import { MyKV } from './my-kv';
 *
 * const app = new Hono();
 * app.use('*', agentuity({
 *   services: {
 *     services: { kv: new MyKV() }
 *   }
 * }));
 * ```
 */

import { createMiddleware } from 'hono/factory';
import { registerOtel, type OtelConfig, type OtelResponse } from '@agentuity/otel';
import { initServices, getServices, resetServices, type ServicesConfig } from '@agentuity/services';

export interface AgentuityOptions {
	/** OTel configuration */
	otel?: Partial<OtelConfig>;
	/** Services configuration (passed to initServices) */
	services?: ServicesConfig;
}

// Global state (initialized once at composition time)
let otelInstance: OtelResponse | null = null;

/**
 * Create the Agentuity middleware for Hono.
 *
 * Initializes OTel and services at middleware composition time,
 * making them available via Hono's context variables.
 *
 * Services are auto-initialized from `@agentuity/services` which
 * defaults to cloud services when AGENTUITY_SDK_KEY is present.
 * Override via `services` option.
 */
export function agentuity(options?: AgentuityOptions) {
	// Initialize OTel
	if (!otelInstance) {
		otelInstance = registerOtel({
			name: process.env.AGENTUITY_APP_NAME ?? 'agentuity-app',
			version: process.env.AGENTUITY_APP_VERSION ?? '1.0.0',
			sdkVersion: process.env.AGENTUITY_CLOUD_SDK_VERSION,
			cliVersion: process.env.AGENTUITY_CLI_VERSION,
			orgId: process.env.AGENTUITY_CLOUD_ORG_ID,
			projectId: process.env.AGENTUITY_CLOUD_PROJECT_ID,
			deploymentId: process.env.AGENTUITY_CLOUD_DEPLOYMENT_ID,
			environment: process.env.AGENTUITY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',
			devmode: process.env.AGENTUITY_SDK_DEV_MODE === 'true',
			bearerToken: process.env.AGENTUITY_OTLP_BEARER_TOKEN ?? process.env.AGENTUITY_SDK_KEY,
			...options?.otel,
		});
	}

	// Initialize services (passes logger from OTel)
	initServices({
		logger: otelInstance.logger as any,
		tracer: otelInstance.tracer,
		...options?.services,
	});

	// Return the middleware handler
	return createMiddleware(async (c, next) => {
		// Inject OTel into context
		c.set('tracer', otelInstance!.tracer as any);
		c.set('logger', otelInstance!.logger as any);
		c.set('meter', otelInstance!.meter as any);

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
 * Get the OTel instance. Available after agentuity() is composed.
 */
export function getOtel(): OtelResponse | null {
	return otelInstance;
}

/**
 * Reset global state (for testing).
 */
export function reset(): void {
	otelInstance = null;
	resetServices();
}

// Re-export getServices for convenience
export { getServices, resetServices };

// Re-export types
export type { OtelConfig, OtelResponse } from '@agentuity/otel';
export type { ServicesConfig, Services } from '@agentuity/services';
