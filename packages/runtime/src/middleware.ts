/**
 * Middleware factories for Vite-native architecture
 * Extracted from _server.ts to be used by generated entry files
 */

import { createMiddleware } from 'hono/factory';
import { cors } from 'hono/cors';
import { compress } from 'hono/compress';
import type { Env, CompressionConfig } from './app';
import type { Logger } from './logger';
import { getAppConfig } from './app';
import { generateId } from './session';
import { runInHTTPContext } from './_context';
import { DURATION_HEADER, TOKENS_HEADER } from './_tokens';
import { extractTraceContextFromRequest } from './otel/http';
import {
	context,
	SpanKind,
	SpanStatusCode,
	trace,
	propagation,
	Meter,
	Tracer,
} from '@opentelemetry/api';
import { TraceState } from '@opentelemetry/core';
import * as runtimeConfig from './_config';
import { getSessionEventProvider } from './_services';
import { internal } from './logger/internal';

const SESSION_HEADER = 'x-session-id';
const THREAD_HEADER = 'x-thread-id';
const DEPLOYMENT_HEADER = 'x-deployment';

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function installContextPropertyHelpers(c: any): void {
	for (const property of AGENT_CONTEXT_PROPERTIES) {
		if (Object.prototype.hasOwnProperty.call(c, property)) {
			continue;
		}

		Object.defineProperty(c, property, {
			get() {
				throw new Error(
					`In route handlers, use c.var.${property} instead of c.${property}. ` +
						`The property '${property}' is available on AgentContext (for agent handlers) ` +
						`but must be accessed via c.var in HonoContext (route handlers).`
				);
			},
			configurable: true,
			enumerable: false,
		});
	}
}

export interface MiddlewareConfig {
	logger: Logger;
	tracer: Tracer;
	meter: Meter;
	corsOptions?: Parameters<typeof cors>[0];
}

/**
 * Create base middleware that sets up context variables
 */
export function createBaseMiddleware(config: MiddlewareConfig) {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return createMiddleware<Env<any>>(async (c, next) => {
		c.set('logger', config.logger);
		c.set('tracer', config.tracer);
		c.set('meter', config.meter);

		// Import services dynamically to avoid circular deps
		const { getServices } = await import('./_services');
		const { getAppState } = await import('./app');

		c.set('app', getAppState());

		const services = getServices();
		c.set('kv', services.kv);
		c.set('stream', services.stream);
		c.set('vector', services.vector);
		c.set('sandbox', services.sandbox);

		installContextPropertyHelpers(c);

		const isWebSocket = c.req.header('upgrade')?.toLowerCase() === 'websocket';
		const skipLogging = c.req.path.startsWith('/_agentuity/');
		const started = performance.now();

		if (!skipLogging) {
			config.logger.debug('%s %s started', c.req.method, c.req.path);
		}

		await runInHTTPContext(c, next);

		if (!isWebSocket) {
			const endTime = performance.now();
			const duration = ((endTime - started) / 1000).toFixed(1);
			c.header(DURATION_HEADER, `${duration}s`);
		}

		if (!skipLogging && !isWebSocket) {
			config.logger.debug(
				'%s %s completed (%d) in %sms',
				c.req.method,
				c.req.path,
				c.res.status,
				Number(performance.now() - started).toFixed(2)
			);
		}
	});
}

/**
 * Create CORS middleware with lazy config resolution.
 *
 * Handles Cross-Origin Resource Sharing (CORS) headers for API routes.
 * Config is resolved at request time, allowing it to be set via createApp().
 * Static options passed here take precedence over app config.
 *
 * Default behavior:
 * - Reflects the request origin (allows any origin)
 * - Allows common headers: Content-Type, Authorization, Accept, Origin, X-Requested-With
 * - Allows all standard HTTP methods
 * - Enables credentials
 * - Sets max-age to 600 seconds (10 minutes)
 *
 * @param staticOptions - Optional static CORS options that override app config
 *
 * @example
 * ```typescript
 * // Use with default settings
 * app.use('/api/*', createCorsMiddleware());
 *
 * // Or configure via createApp
 * const app = await createApp({
 *   cors: {
 *     origin: 'https://example.com',
 *     allowHeaders: ['Content-Type', 'Authorization', 'X-Custom-Header'],
 *     maxAge: 3600,
 *   }
 * });
 *
 * // Or pass static options directly (overrides app config)
 * app.use('/api/*', createCorsMiddleware({
 *   origin: ['https://app.example.com', 'https://admin.example.com'],
 *   credentials: true,
 * }));
 * ```
 */
export function createCorsMiddleware(staticOptions?: Parameters<typeof cors>[0]) {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return createMiddleware<Env<any>>(async (c, next) => {
		// Lazy resolve: merge app config with static options
		const appConfig = getAppConfig();
		const corsOptions = {
			...appConfig?.cors,
			...staticOptions,
		};

		const corsMiddleware = cors({
			origin: corsOptions?.origin ?? ((origin: string) => origin),
			allowHeaders: corsOptions?.allowHeaders ?? [
				'Content-Type',
				'Authorization',
				'Accept',
				'Origin',
				'X-Requested-With',
				THREAD_HEADER,
			],
			allowMethods: ['POST', 'GET', 'OPTIONS', 'HEAD', 'PUT', 'DELETE', 'PATCH'],
			exposeHeaders: [
				'Content-Length',
				TOKENS_HEADER,
				DURATION_HEADER,
				THREAD_HEADER,
				SESSION_HEADER,
				DEPLOYMENT_HEADER,
			],
			maxAge: 600,
			credentials: true,
			...(corsOptions ?? {}),
		});

		return corsMiddleware(c, next);
	});
}

/**
 * Create OpenTelemetry middleware for session/thread tracking
 * This is the critical middleware that creates AgentContext
 */
export function createOtelMiddleware() {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return createMiddleware<Env<any>>(async (c, next) => {
		// Import providers dynamically to avoid circular deps
		const { getThreadProvider, getSessionProvider } = await import('./_services');
		const WaitUntilHandler = (await import('./_waituntil')).default;

		const extractedContext = extractTraceContextFromRequest(c.req.raw);
		const method = c.req.method;
		const url = new URL(c.req.url);
		const threadProvider = getThreadProvider();
		const sessionProvider = getSessionProvider();

		await context.with(extractedContext, async (): Promise<void> => {
			const tracer = trace.getTracer('http-server');
			await tracer.startActiveSpan(
				`HTTP ${method}`,
				{
					kind: SpanKind.SERVER,
					attributes: {
						'http.method': method,
						'http.host': url.host,
						'http.user_agent': c.req.header('user-agent') || '',
						'http.path': url.pathname,
					},
				},
				async (span): Promise<void> => {
					const sctx = span.spanContext();
					const sessionId = sctx?.traceId ? `sess_${sctx.traceId}` : generateId('sess');

					let traceState = sctx.traceState ?? new TraceState();
					const projectId = runtimeConfig.getProjectId();
					const orgId = runtimeConfig.getOrganizationId();
					const deploymentId = runtimeConfig.getDeploymentId();
					const isDevMode = runtimeConfig.isDevMode();

					internal.info(
						'[session] config: orgId=%s, projectId=%s, deploymentId=%s, isDevMode=%s',
						orgId ?? 'NOT SET (AGENTUITY_CLOUD_ORG_ID)',
						projectId ?? 'NOT SET (AGENTUITY_CLOUD_PROJECT_ID)',
						deploymentId ?? 'none',
						isDevMode
					);

					if (projectId) traceState = traceState.set('pid', projectId);
					if (orgId) traceState = traceState.set('oid', orgId);
					if (isDevMode) traceState = traceState.set('d', '1');

					// Update the active context with the new trace state
					// Note: SpanContext.traceState is readonly, so we update it by setting the span with a new context
					trace.setSpan(
						context.active(),
						trace.wrapSpanContext({
							...sctx,
							traceState,
						})
					);

					const thread = await threadProvider.restore(c);
					const session = await sessionProvider.restore(thread, sessionId);
					const handler = new WaitUntilHandler(tracer);

					c.set('sessionId', sessionId);
					c.set('thread', thread);
					c.set('session', session);
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					(c as any).set('waitUntilHandler', handler);
					const agentIds = new Set<string>();
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					(c as any).set('agentIds', agentIds);
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					(c as any).set('trigger', 'api');

					// Send session start event (so evalruns can reference this session)
					const sessionEventProvider = getSessionEventProvider();
					const shouldSendSession = !!(orgId && projectId);
					if (shouldSendSession && sessionEventProvider) {
						try {
							// eslint-disable-next-line @typescript-eslint/no-explicit-any
							const routeId = (c as any).var?.routeId || '';
							await sessionEventProvider.start({
								id: sessionId,
								threadId: thread.id,
								orgId,
								projectId,
								deploymentId: deploymentId || undefined,
								devmode: isDevMode,
								trigger: 'api',
								routeId,
								environment: runtimeConfig.getEnvironment(),
								url: c.req.path,
								method: c.req.method,
							});
						} catch (_ex) {
							// Silently ignore session start errors - don't block request
						}
					}

					try {
						await next();
						// Save session/thread and send events
						internal.info('[session] saving session %s (thread: %s)', sessionId, thread.id);
						await sessionProvider.save(session);
						internal.info('[session] session saved, now saving thread');
						await threadProvider.save(thread);
						internal.info('[session] thread saved');
						span.setStatus({ code: SpanStatusCode.OK });
					} catch (ex) {
						if (ex instanceof Error) {
							span.recordException(ex);
						}
						span.setStatus({
							code: SpanStatusCode.ERROR,
							message: (ex as Error).message ?? String(ex),
						});
						throw ex;
					} finally {
						// Send session complete event
						internal.info(
							'[session] shouldSendSession: %s, hasSessionEventProvider: %s',
							shouldSendSession,
							!!sessionEventProvider
						);
						if (shouldSendSession && sessionEventProvider) {
							try {
								const userData = session.serializeUserData();
								internal.info(
									'[session] sending session complete event, userData: %s',
									userData ? `${userData.length} bytes` : 'none'
								);
								// eslint-disable-next-line @typescript-eslint/no-explicit-any
								const agentIdsSet = (c as any).get('agentIds') as Set<string> | undefined;
								const agentIds = agentIdsSet ? [...agentIdsSet].filter(Boolean) : undefined;
								internal.info('[session] agentIds: %o', agentIds);
								await sessionEventProvider.complete({
									id: sessionId,
									threadId: thread.empty() ? null : thread.id,
									statusCode: c.res?.status ?? 200,
									agentIds: agentIds?.length ? agentIds : undefined,
									userData,
								});
								internal.info('[session] session complete event sent');
							} catch (ex) {
								internal.info('[session] session complete event failed: %s', ex);
								// Silently ignore session complete errors - don't block response
							}
						}

						const headers: Record<string, string> = {};
						propagation.inject(context.active(), headers);
						for (const key of Object.keys(headers)) {
							c.header(key, headers[key]);
						}
						const traceId = sctx?.traceId || sessionId.replace(/^sess_/, '');
						c.header(SESSION_HEADER, `sess_${traceId}`);
						if (deploymentId) {
							c.header(DEPLOYMENT_HEADER, deploymentId);
						}
						span.end();
					}
				}
			);
		});
	});
}

/**
 * Create compression middleware with lazy config resolution.
 *
 * Compresses response bodies using gzip or deflate based on the Accept-Encoding header.
 * Config is resolved at request time, allowing it to be set via createApp().
 *
 * @param staticConfig - Optional static config that overrides app config
 *
 * @example
 * ```typescript
 * // Use with default settings
 * app.use('*', createCompressionMiddleware());
 *
 * // Or configure via createApp
 * const app = await createApp({
 *   compression: {
 *     threshold: 2048,
 *   }
 * });
 * ```
 */
export function createCompressionMiddleware(staticConfig?: CompressionConfig) {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return createMiddleware<Env<any>>(async (c, next) => {
		// Lazy resolve: merge app config with static config
		const appConfig = getAppConfig();
		const appCompressionConfig = appConfig?.compression;

		// Check if compression is explicitly disabled
		if (appCompressionConfig === false || staticConfig?.enabled === false) {
			return next();
		}

		// Merge configs: static config takes precedence over app config
		const config: CompressionConfig = {
			...(typeof appCompressionConfig === 'object' ? appCompressionConfig : {}),
			...staticConfig,
		};

		const { enabled = true, threshold = 1024, filter, honoOptions } = config;

		// Skip if explicitly disabled
		if (!enabled) {
			return next();
		}

		// Skip WebSocket upgrade requests
		const upgrade = c.req.header('upgrade');
		if (upgrade && upgrade.toLowerCase() === 'websocket') {
			return next();
		}

		// Skip if no Accept-Encoding header
		const acceptEncoding = c.req.header('accept-encoding');
		if (!acceptEncoding) {
			return next();
		}

		// Check custom filter
		if (filter && !filter(c)) {
			return next();
		}

		// Create and run the Hono compress middleware
		const compressMiddleware = compress({
			threshold,
			...honoOptions,
		});

		await compressMiddleware(c, next);
	});
}
