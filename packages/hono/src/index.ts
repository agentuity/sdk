/**
 * @agentuity/hono - Agentuity middleware for Hono
 *
 * Provides the `agentuity()` middleware that initializes OTel and services,
 * injecting them into Hono's context variables.
 *
 * @example
 * ```typescript
 * import { Hono } from 'hono';
 * import { agentuity } from '@agentuity/hono';
 * import { kv } from '@agentuity/services';
 *
 * const app = new Hono();
 * app.use('*', agentuity());
 *
 * app.get('/data', async (c) => {
 *   const data = await kv.get('key');
 *   return c.json(data);
 * });
 *
 * export default app;
 * ```
 */

import { createMiddleware } from 'hono/factory';
import { registerOtel, type OtelConfig, type OtelResponse } from '@agentuity/otel';
import { initServices, getServices, type ServicesConfig, type Services } from '@agentuity/services';

export interface AgentuityOptions {
	/** OTel configuration */
	otel?: Partial<OtelConfig>;
	/** Services configuration */
	services?: ServicesConfig;
}

// Global state (initialized once at composition time)
let otelInstance: OtelResponse | null = null;
let servicesInstance: Services | null = null;

/**
 * Create the Agentuity middleware for Hono.
 *
 * Initializes OTel and services at middleware composition time,
 * making them available via Hono's context variables.
 *
 * @example
 * ```typescript
 * import { Hono } from 'hono';
 * import { agentuity } from '@agentuity/hono';
 *
 * const app = new Hono();
 * app.use('*', agentuity());
 *
 * app.get('/data', async (c) => {
 *   // Access via c.var
 *   const kv = c.var.kv;
 *   const logger = c.var.logger;
 *   const data = await kv.get('key');
 *   return c.json(data);
 * });
 * ```
 */
export function agentuity(options?: AgentuityOptions) {
	// Initialize at composition time (before any requests)
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

	if (!servicesInstance) {
		servicesInstance = initServices({
			logger: otelInstance.logger as any,
			tracer: otelInstance.tracer,
			...options?.services,
		});
	}

	// Return the middleware handler
	return createMiddleware(async (c, next) => {
		// Inject OTel into context
		c.set('tracer', otelInstance!.tracer as any);
		c.set('logger', otelInstance!.logger as any);
		c.set('meter', otelInstance!.meter as any);
		// Inject services into context
		c.set('kv', servicesInstance!.kv as any);
		c.set('stream', servicesInstance!.stream as any);
		c.set('vector', servicesInstance!.vector as any);
		c.set('queue', servicesInstance!.queue as any);
		c.set('email', servicesInstance!.email as any);
		c.set('schedule', servicesInstance!.schedule as any);
		c.set('task', servicesInstance!.task as any);
		c.set('sandbox', servicesInstance!.sandbox as any);

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
 * Get services. Available after agentuity() is composed.
 */
export { getServices, initServices };

export type { Services, ServicesConfig } from '@agentuity/services';
export type { OtelConfig, OtelResponse } from '@agentuity/otel';
