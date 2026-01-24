/**
 * Middleware factories for Vite-native architecture
 * Extracted from _server.ts to be used by generated entry files
 */

import { createMiddleware } from 'hono/factory';
import { cors } from 'hono/cors';
import { compress } from 'hono/compress';
import { setSignedCookie } from 'hono/cookie';
import type { Env, CompressionConfig, CorsConfig } from './app';
import { createTrustedCorsOrigin } from './cors';
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
import { STREAM_DONE_PROMISE_KEY, IS_STREAMING_RESPONSE_KEY } from './handlers/sse';
import { loadBuildMetadata } from './_metadata';

const SESSION_HEADER = 'x-session-id';
const THREAD_HEADER = 'x-thread-id';
const DEPLOYMENT_HEADER = 'x-deployment';

/**
 * Paths that should skip OTEL session tracking.
 * These routes are still accessible but won't create session events.
 */
const OTEL_SESSION_SKIP_PATHS = new Set([
	'/_agentuity/workbench/ws',
	'/_agentuity/workbench/sample',
	'/_agentuity/workbench/state',
	'/_agentuity/workbench/metadata.json',
	'/_agentuity/webanalytics/analytics.js',
	'/_agentuity/webanalytics/session.js',
]);

export const AGENT_CONTEXT_PROPERTIES = [
	'logger',
	'tracer',
	'sessionId',
	'kv',
	'stream',
	'vector',
	'sandbox',
	'queue',
	'state',
	'thread',
	'session',
	'config',
	'app',
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
		c.set('queue', services.queue);

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

			// Set deployment header for all routes
			const deploymentId = runtimeConfig.getDeploymentId();
			if (deploymentId) {
				c.header(DEPLOYMENT_HEADER, deploymentId);
			}
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
export function createCorsMiddleware(staticOptions?: CorsConfig) {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return createMiddleware<Env<any>>(async (c, next) => {
		// Lazy resolve: merge app config with static options
		const appConfig = getAppConfig();
		const appCors = appConfig?.cors;
		const corsOptions = {
			...appCors,
			...staticOptions,
		};

		// Extract Agentuity-specific options
		const { sameOrigin, allowedOrigins, ...honoCorsOptions } = corsOptions;

		// Determine origin handler based on sameOrigin setting
		let originHandler: NonNullable<Parameters<typeof cors>[0]>['origin'];
		if (sameOrigin) {
			// Use trusted origins (env vars + allowedOrigins + same-origin)
			originHandler = createTrustedCorsOrigin({ allowedOrigins });
		} else if (honoCorsOptions.origin !== undefined) {
			// Use explicitly provided origin
			originHandler = honoCorsOptions.origin;
		} else {
			// Default: reflect any origin (backwards compatible)
			originHandler = (origin: string) => origin;
		}

		// Required headers that must always be allowed/exposed for runtime functionality
		const requiredAllowHeaders = [THREAD_HEADER];
		const requiredExposeHeaders = [
			TOKENS_HEADER,
			DURATION_HEADER,
			THREAD_HEADER,
			SESSION_HEADER,
			DEPLOYMENT_HEADER,
		];

		// Default headers to allow (used if none specified)
		const defaultAllowHeaders = [
			'Content-Type',
			'Authorization',
			'Accept',
			'Origin',
			'X-Requested-With',
		];

		// Default headers to expose (used if none specified)
		const defaultExposeHeaders = ['Content-Length'];

		const corsMiddleware = cors({
			...honoCorsOptions,
			origin: originHandler,
			// Always include required headers, merge with user-provided or defaults
			allowHeaders: [
				...(honoCorsOptions.allowHeaders ?? defaultAllowHeaders),
				...requiredAllowHeaders,
			],
			allowMethods: honoCorsOptions.allowMethods ?? [
				'POST',
				'GET',
				'OPTIONS',
				'HEAD',
				'PUT',
				'DELETE',
				'PATCH',
			],
			// Always include required headers, merge with user-provided or defaults
			exposeHeaders: [
				...(honoCorsOptions.exposeHeaders ?? defaultExposeHeaders),
				...requiredExposeHeaders,
			],
			maxAge: honoCorsOptions.maxAge ?? 600,
			credentials: honoCorsOptions.credentials ?? true,
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
		// Skip session tracking for paths in the skip list
		if (OTEL_SESSION_SKIP_PATHS.has(c.req.path)) {
			return next();
		}

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
				`${method} ${url.pathname}`,
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
					// Track request duration from the SDK's perspective
					const requestStartTime = performance.now();
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
					if (deploymentId) traceState = traceState.set('did', deploymentId);
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
					// The provider decides whether to send based on available data (orgId, projectId, etc.)
					const sessionEventProvider = getSessionEventProvider();
					if (sessionEventProvider) {
						try {
							// Look up routeId from build metadata by matching method and path
							// We need to do this here because the router wrapper hasn't run yet
							const metadata = loadBuildMetadata();
							const methodUpper = c.req.method.toUpperCase();
							const requestPath = c.req.path;
							
							// Try matching by request path, then by path ending (handles /api/translate matching /translate)
							let route = metadata?.routes?.find(
								(r) => r.method.toUpperCase() === methodUpper && r.path === requestPath
							);
							if (!route) {
								route = metadata?.routes?.find(
									(r) => r.method.toUpperCase() === methodUpper && requestPath.endsWith(r.path)
								);
							}
							const routeId = route?.id || '';
							
							await sessionEventProvider.start({
								id: sessionId,
								threadId: thread.id,
								orgId: orgId || '',
								projectId: projectId || '',
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

					// Factor out finalization logic so it can run synchronously or deferred
					const finalizeSession = async (statusCode?: number, error?: string) => {
						internal.info(
							'[session] saving session %s (thread: %s) (error: %s)',
							sessionId,
							thread.id,
							error
						);
						await sessionProvider.save(session);
						internal.info('[session] session saved, now saving thread');
						await threadProvider.save(thread);
						internal.info('[session] thread saved');

						// Send session complete event
						if (sessionEventProvider) {
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
								const isEmpty = await thread.empty();
								await sessionEventProvider.complete({
									id: sessionId,
									threadId: isEmpty ? null : thread.id,
									statusCode: statusCode ?? c.res?.status ?? 200,
									error,
									agentIds: agentIds?.length ? agentIds : undefined,
									userData,
								});
								internal.info('[session] session complete event sent');
							} catch (ex) {
								internal.info(
									'[session] session complete event failed: %s',
									ex instanceof Error ? ex.message : ex
								);
								// Silently ignore session complete errors - don't block response
							}
						}
					};

					// Track state for finalization
					let responseStatus = 200;
					let errorMessage: string | undefined;
					let handlerDurationMs = 0;

					try {
						internal.info('[request] %s %s - handler starting (session: %s)', method, url.pathname, sessionId);
						
						await next();

						// Capture timing immediately after next() returns - this is when the handler completed
						// This is the HTTP response time we want to report (excludes waitUntil/finalization)
						handlerDurationMs = performance.now() - requestStartTime;
						
						internal.info('[request] %s %s - handler completed in %sms (session: %s)', method, url.pathname, handlerDurationMs.toFixed(2), sessionId);

						// Check if this is a streaming response that needs deferred finalization
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						const streamDone = (c as any).get(STREAM_DONE_PROMISE_KEY) as Promise<void> | undefined;
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						const isStreaming = Boolean((c as any).get(IS_STREAMING_RESPONSE_KEY));

						// Check if Hono caught an error (c.error is set by Hono's error handler)
						// or if the response status indicates an error
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						const honoError = (c as any).error as Error | undefined;
						responseStatus = c.res?.status ?? 200;
						const isError = honoError || responseStatus >= 500;

						internal.info('[request] %s %s - status: %d, streaming: %s, error: %s (session: %s)', 
							method, url.pathname, responseStatus, isStreaming, isError, sessionId);

						if (isError) {
							// Capture error message for finalization
							errorMessage = honoError
								? (honoError.stack ?? honoError.message)
								: `HTTP ${responseStatus}`;
							span.setStatus({
								code: SpanStatusCode.ERROR,
								message: honoError?.message ?? errorMessage,
							});
							if (honoError) {
								span.recordException(honoError);
							}
						} else {
							span.setStatus({ code: SpanStatusCode.OK });
						}

						// For streaming responses, defer everything until stream completes
						if (isStreaming && streamDone) {
							internal.info('[request] %s %s - streaming response, deferring finalization (session: %s)', 
								method, url.pathname, sessionId);
							
							// Use waitUntil to handle stream completion and finalization
							// This runs AFTER the response is sent to the client
							handler.waitUntil(async () => {
								try {
									await streamDone;
									internal.info('[request] %s %s - stream completed (session: %s)', method, url.pathname, sessionId);
								} catch (ex) {
									internal.info('[request] %s %s - stream ended with error: %s (session: %s)', 
										method, url.pathname, ex, sessionId);
								}
								// Record duration now that stream is complete
								const streamDurationMs = performance.now() - requestStartTime;
								const durationNs = Math.round(streamDurationMs * 1_000_000);
								internal.info('[request] %s %s - recording stream duration: %sms (session: %s)', 
									method, url.pathname, streamDurationMs.toFixed(2), sessionId);
								span.setAttribute('@agentuity/request.duration', durationNs);
								span.setAttribute('http.status_code', responseStatus);
								
								// Finalize session after stream completes
								await finalizeSession(responseStatus >= 500 ? responseStatus : undefined, errorMessage);
								internal.info('[request] %s %s - stream session finalization complete (session: %s)', method, url.pathname, sessionId);
							});
						} else {
							// Non-streaming: record duration immediately
							const durationNs = Math.round(handlerDurationMs * 1_000_000);
							internal.info('[request] %s %s - recording duration: %sms (%dns) (session: %s)', 
								method, url.pathname, handlerDurationMs.toFixed(2), durationNs, sessionId);
							span.setAttribute('@agentuity/request.duration', durationNs);
							span.setAttribute('http.status_code', responseStatus);
							
							// Defer session finalization to run AFTER response is sent
							// Use noSpan: true because this waitUntil is just for coordination (waiting for evals)
							// The actual work (session finalization) creates its own span via finalizeSession
							handler.waitUntil(async () => {
								// Wait for any pending background tasks (evals, etc.)
								if (handler.hasPending()) {
									internal.info('[request] %s %s - waiting for pending waitUntil tasks (session: %s)', 
										method, url.pathname, sessionId);
									const logger = c.get('logger');
									await handler.waitUntilAll(logger, sessionId);
									internal.info('[request] %s %s - all waitUntil tasks complete (session: %s)', method, url.pathname, sessionId);
								}
								
								// Finalize session - this is the actual work
								internal.info('[request] %s %s - starting session finalization (session: %s)', method, url.pathname, sessionId);
								try {
									await finalizeSession(responseStatus >= 500 ? responseStatus : undefined, errorMessage);
									internal.info('[request] %s %s - session finalization complete (session: %s)', method, url.pathname, sessionId);
								} catch (ex) {
									internal.error('[request] %s %s - session finalization failed: %s (session: %s)', 
										method, url.pathname, ex, sessionId);
								}
							}, { noSpan: true });
						}
					} catch (ex) {
						// Record request metrics even on exceptions (500 status)
						const exceptionDurationMs = performance.now() - requestStartTime;
						const durationNs = Math.round(exceptionDurationMs * 1_000_000);
						internal.info('[request] %s %s - recording exception duration: %sms (session: %s)', 
							method, url.pathname, exceptionDurationMs.toFixed(2), sessionId);
						span.setAttribute('@agentuity/request.duration', durationNs);
						span.setAttribute('http.status_code', 500);

						if (ex instanceof Error) {
							span.recordException(ex);
						}
						errorMessage = ex instanceof Error ? (ex.stack ?? ex.message) : String(ex);
						responseStatus = 500;
						span.setStatus({
							code: SpanStatusCode.ERROR,
							message: ex instanceof Error ? ex.message : String(ex),
						});

						// Still defer finalization even on error
						// Use noSpan: true since finalizeSession creates its own Session End span
						handler.waitUntil(async () => {
							try {
								await finalizeSession(500, errorMessage);
							} catch (finalizeEx) {
								internal.error('[request] %s %s - error session finalization failed: %s (session: %s)', 
									method, url.pathname, finalizeEx, sessionId);
							}
						}, { noSpan: true });

						throw ex;
					} finally {
						// Set response headers - this is the only thing that should block the response
						const headers: Record<string, string> = {};
						propagation.inject(context.active(), headers);
						for (const key of Object.keys(headers)) {
							c.header(key, headers[key]);
						}
						const traceId = sctx?.traceId || sessionId.replace(/^sess_/, '');
						c.header(SESSION_HEADER, `sess_${traceId}`);

						internal.info('[request] %s %s - response ready, duration: %sms (session: %s)', 
							method, url.pathname, handlerDurationMs.toFixed(2), sessionId);
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
export function createCompressionMiddleware(
	staticConfig?: CompressionConfig,
	/**
	 * Optional config resolver for testing. When provided, this is used instead of getAppConfig().
	 * @internal
	 */
	configResolver?: () => { compression?: CompressionConfig | false } | undefined
) {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return createMiddleware<Env<any>>(async (c, next) => {
		// Lazy resolve: merge app config with static config
		const appConfig = configResolver ? configResolver() : getAppConfig();
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

/**
 * Create lightweight thread middleware for web routes (analytics).
 *
 * Sets thread cookie that persists across page views for client-side analytics.
 * This middleware does NOT:
 * - Create or track sessions (no session ID)
 * - Set session/thread response headers
 * - Send events to Catalyst sessions table
 *
 * This is intentionally separate from createOtelMiddleware to avoid
 * polluting the sessions table with web browsing activity.
 *
 * - Thread cookie (atid_a): Analytics-readable copy, 1-week expiry
 */
export function createWebSessionMiddleware() {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return createMiddleware<Env<any>>(async (c, next) => {
		// Import providers dynamically to avoid circular deps
		const { getThreadProvider } = await import('./_services');

		const secret = getSessionSecret();

		// Use ThreadProvider.restore() to get/create thread (handles header, cookie, generation)
		const threadProvider = getThreadProvider();
		const thread = await threadProvider.restore(c);

		// Set thread cookie for analytics
		// httpOnly: false so beacon script can read it
		const isSecure = c.req.url.startsWith('https://');
		await setSignedCookie(c, 'atid_a', thread.id, secret, {
			httpOnly: false, // Readable by JavaScript for analytics
			secure: isSecure,
			sameSite: 'Lax',
			path: '/',
			maxAge: 604800, // 1 week
		});

		// Store in context for handler to access in same request
		// (cookies aren't readable until the next request)
		c.set('_webThreadId', thread.id);

		await next();
	});
}

/**
 * Get the secret used for signing session/thread cookies.
 * Uses AGENTUITY_SDK_KEY if available, falls back to 'agentuity'.
 */
export function getSessionSecret(): string {
	return process.env.AGENTUITY_SDK_KEY || 'agentuity';
}
