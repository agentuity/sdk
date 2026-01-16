/**
 * Minimal server globals for Vite-native architecture
 * The server is managed by Vite (dev) or Bun.serve in the generated entry file (prod)
 */

import type { Logger } from './logger';
import type { Hono, Context as HonoContext } from 'hono';
import type { Env, PrivateVariables } from './app';
import type { Tracer } from '@opentelemetry/api';
import type { SpanProcessor } from '@opentelemetry/sdk-trace-base';
import { TokenSpanProcessor } from './_tokens';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let globalRouterInstance: Hono<Env<any>> | null = null;
let globalLogger: Logger | null = null;
let globalTracer: Tracer | null = null;

// Initialize with built-in span processors
const spanProcessors: SpanProcessor[] = [new TokenSpanProcessor()];

/**
 * List of AgentContext properties that should trigger helpful error messages
 * when accessed directly on HonoContext in route handlers.
 */
export const AGENT_CONTEXT_PROPERTIES = [
	'logger',
	'tracer',
	'sessionId',
	'kv',
	'stream',
	'vector',
	'sandbox',
	'state',
	'thread',
	'session',
	'config',
	'app',
	'waitUntil',
] as const;

export function getRouter() {
	return globalRouterInstance;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setGlobalRouter(router: Hono<Env<any>>) {
	globalRouterInstance = router;
}

/**
 * Returns the global logger instance.
 * This is a singleton created during application initialization.
 */
export function createLogger() {
	return globalLogger;
}

export function getLogger() {
	return globalLogger;
}

export function setGlobalLogger(logger: Logger) {
	globalLogger = logger;
}

export function getTracer() {
	return globalTracer;
}

export function setGlobalTracer(tracer: Tracer) {
	globalTracer = tracer;
}

/**
 * Add a custom span processor that will be added to the otel configuration.
 * This method must be called before the server is initialized.
 */
export function addSpanProcessor(processor: SpanProcessor) {
	spanProcessors.push(processor);
}

export function getSpanProcessors(): SpanProcessor[] {
	return spanProcessors;
}

/**
 * Helper to cast HonoContext to include private variables
 */
export function privateContext<E extends Env>(c: HonoContext<E>) {
	return c as unknown as HonoContext<{ Variables: PrivateVariables }>;
}

/**
 * No-op for Vite-native architecture (Vite manages server lifecycle)
 */
export const notifyReady = () => {
	// No-op: Vite handles server readiness
};

/**
 * No-op for Vite-native architecture (returns null)
 */
export function getServer() {
	return null;
}
