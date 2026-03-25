/**
 * @agentuity/analytics - OpenTelemetry analytics for Agentuity
 *
 * Auto-initializes from environment variables on import (Vercel-style).
 *
 * @example Automatic initialization (recommended)
 * ```typescript
 * // Just import - auto-configures from AGENTUITY_* env vars
 * import '@agentuity/analytics';
 *
 * // Then access the globals anywhere
 * import { tracer, logger, meter } from '@agentuity/analytics';
 * ```
 *
 * @example Explicit configuration
 * ```typescript
 * import { register } from '@agentuity/analytics';
 *
 * register({
 *   name: 'my-app',
 *   version: '1.0.0',
 *   // ... optional overrides
 * });
 * ```
 */

// Re-export types
export type { Logger } from './logger';

// Re-export console reference for custom loggers
export { __originalConsole } from './logger';
export type { AnalyticsConfig, AnalyticsResponse } from './analytics';

// Re-export HTTP utilities for trace context propagation
export { injectTraceContextToHeaders, extractTraceContextFromRequest } from './http';

// Re-export trace state utilities
export {
	enrichContextWithTraceState,
	generateTraceId,
	generateSpanId,
	type TraceStateEntries,
} from './tracestate';

// Core registration function
export { register, registerAnalytics, getAnalytics, ensureInitialized } from './analytics';

// Lazy-loaded exports - auto-initialized from env vars
import type { Tracer, Meter } from '@opentelemetry/api';
import type { Logger } from './logger';
import { ensureInitialized } from './analytics';

/**
 * Get the OpenTelemetry tracer (auto-initialized)
 */
export const tracer: Tracer = new Proxy({} as Tracer, {
	get: (_, prop) => ensureInitialized().tracer[prop as keyof Tracer],
});

/**
 * Get the OpenTelemetry meter (auto-initialized)
 */
export const meter: Meter = new Proxy({} as Meter, {
	get: (_, prop) => ensureInitialized().meter[prop as keyof Meter],
});

/**
 * Get the Logger instance (auto-initialized)
 */
export const logger: Logger = new Proxy({} as Logger, {
	get: (_, prop) => ensureInitialized().logger[prop as keyof Logger],
});

/**
 * Shutdown analytics (call on process exit)
 */
export async function shutdown(): Promise<void> {
	const analytics = ensureInitialized();
	if (analytics?.shutdown) {
		await analytics.shutdown();
	}
}
