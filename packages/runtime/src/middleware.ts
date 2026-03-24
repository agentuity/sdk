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
import { enrichContextWithTraceState } from './otel/tracestate';
import { context, SpanKind, SpanStatusCode, trace, propagation } from '@opentelemetry/api';
import type { Meter, Tracer } from '@opentelemetry/api';
import * as runtimeConfig from './_config';
import { getSessionEventProvider } from './_services';
import { internal } from './logger/internal';
import { STREAM_DONE_PROMISE_KEY, IS_STREAMING_RESPONSE_KEY } from './handlers/sse';
import { WS_DONE_PROMISE_KEY } from './handlers/websocket';
import { loadBuildMetadata } from './_metadata';

const SESSION_HEADER = 'x-session-id';
const THREAD_HEADER = 'x-thread-id';
const DEPLOYMENT_HEADER = 'x-deployment';

/**
 * Paths that should skip OTEL session event tracking.
 * These routes still get thread/session setup but won't create session start/complete events.
 */
const OTEL_SESSION_EVENT_SKIP_PATHS = new Set([
	'/_agentuity/workbench/ws',
	'/_agentuity/workbench/sample',
	'/_agentuity/workbench/state',
	'/_agentuity/workbench/metadata.json',
	'/_agentuity/webanalytics/analytics.js',
	'/_agentuity/webanalytics/session.js',
]);

/**
 * Paths that should skip thread/session setup entirely.
 * These are lightweight endpoints that don't need any context.
 */
const OTEL_FULL_SKIP_PATHS = new Set([
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
	'email',
	'schedule',
	'task',
	'state',
	'thread',
	'session',
	'config',
	'app',
] as const;

function installContextPropertyHelpers(c: any): void {
	for (const property of AGENT_CONTEXT_PROPERTIES) {
		if (Object.hasOwn(c, property)) {
			continue;
		}

		Object.defineProperty(c, property, {
			get() {
				throw new Error(
					`In route handlers, use c.var.${property} instead of c.${property}. ` +
						`The property '${property}' is available on AgentContext (for agent handlers) ` +
						'but must be accessed via c.var in HonoContext (route handlers).'
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
		c.set('email', services.email);
		c.set('schedule', services.schedule);
		c.set('task', services.task);

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

		const finalAllowHeaders = [
			...(honoCorsOptions.allowHeaders ?? defaultAllowHeaders),
			...requiredAllowHeaders,
		];

		const corsMiddleware = cors({
			...honoCorsOptions,
			origin: originHandler,
			// Always include required headers, merge with user-provided or defaults
			allowHeaders: finalAllowHeaders,
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
			credentials: honoCorsOptions.credentials ?? originHandler !== '*',
		});

		return corsMiddleware(c, next);
	});
}

/**
 * Create OpenTelemetry middleware for session/thread tracking
 * This is the critical middleware that creates AgentContext
 */
export function createOtelMiddleware() {
	return createMiddleware<Env<any>>(async (c, next) => {
		// Skip thread/session setup entirely for lightweight endpoints
		if (OTEL_FULL_SKIP_PATHS.has(c.req.path)) {
			return next();
		}

		// Check if we should skip session events (but still set up thread/session)
		const skipSessionEvents = OTEL_SESSION_EVENT_SKIP_PATHS.has(c.req.path);

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

			// Build enriched traceState BEFORE span creation so the
			// recording span inherits it and it gets exported to OTLP.
			// Previously, traceState was set on a NonRecordingSpan *after*
			// the recording span was created, which meant it was propagated
			// to outbound requests but never appeared in the exported span
			// data (ClickHouse TraceState column was empty).
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

			const enrichedContext = enrichContextWithTraceState(context.active(), {
				pid: projectId,
				oid: orgId,
				did: deploymentId,
				d: isDevMode ? '1' : undefined,
			});

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
				enrichedContext,
				async (span): Promise<void> => {
					// Track request duration from the SDK's perspective
					const requestStartTime = performance.now();
					const sctx = span.spanContext();
					const sessionId = sctx?.traceId ? `sess_${sctx.traceId}` : generateId('sess');

					const thread = await threadProvider.restore(c);
					const session = await sessionProvider.restore(thread, sessionId);
					const handler = new WaitUntilHandler(tracer);
					const isWsUpgrade = c.req.header('upgrade')?.toLowerCase() === 'websocket';

					c.set('sessionId', sessionId);
					c.set('thread', thread);
					c.set('session', session);
					(c as any).set('waitUntilHandler', handler);
					const agentIds = new Set<string>();
					(c as any).set('agentIds', agentIds);
					(c as any).set('trigger', isWsUpgrade ? 'websocket' : 'api');

					// Send session start event (so evalruns can reference this session)
					// The provider decides whether to send based on available data (orgId, projectId, etc.)
					// Skip for workbench routes that don't need session tracking
					const sessionEventProvider = getSessionEventProvider();
					if (sessionEventProvider && !skipSessionEvents) {
						try {
							// Look up routeId from build metadata by matching method and path
							// We need to do this here because the router wrapper hasn't run yet
							const metadata = loadBuildMetadata();
							const methodUpper = c.req.method.toUpperCase();

							// Normalize paths: trim trailing slashes for consistent matching
							const normalizePath = (p: string) => {
								const decoded = decodeURIComponent(p);
								return decoded.endsWith('/') && decoded.length > 1
									? decoded.slice(0, -1)
									: decoded;
							};
							const requestPath = normalizePath(c.req.path);

							// Helper to check if requestPath ends with routePath at a segment boundary
							// e.g., "/api/translate" matches "/translate" but "/api/translate-v2" does not
							const matchesAtSegmentBoundary = (reqPath: string, routePath: string) => {
								if (reqPath === routePath) return true;
								if (!reqPath.endsWith(routePath)) return false;
								// Check that the character before the match is a path separator
								const charBeforeMatch = reqPath[reqPath.length - routePath.length - 1];
								return charBeforeMatch === '/';
							};

							// Try matching by exact normalized path first
							let route = metadata?.routes?.find(
								(r) =>
									r.method.toUpperCase() === methodUpper &&
									normalizePath(r.path) === requestPath
							);
							// Fall back to segment-boundary matching (handles /api/translate matching /translate)
							if (!route) {
								route = metadata?.routes?.find(
									(r) =>
										r.method.toUpperCase() === methodUpper &&
										matchesAtSegmentBoundary(requestPath, normalizePath(r.path))
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
								trigger: isWsUpgrade ? 'websocket' : 'api',
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

						// Send session complete event (skip for workbench routes)
						if (sessionEventProvider && !skipSessionEvents) {
							try {
								const userData = session.serializeUserData();
								internal.info(
									'[session] sending session complete event, userData: %s',
									userData ? `${userData.length} bytes` : 'none'
								);
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
					// Track whether span should be ended in finally block (false for streaming - ended in waitUntil)
					let shouldEndSpanInFinally = true;

					try {
						internal.info(
							'[request] %s %s - handler starting (session: %s)',
							method,
							url.pathname,
							sessionId
						);

						await next();

						// Capture timing immediately after next() returns - this is when the handler completed
						// This is the HTTP response time we want to report (excludes waitUntil/finalization)
						handlerDurationMs = performance.now() - requestStartTime;

						internal.info(
							'[request] %s %s - handler completed in %sms (session: %s)',
							method,
							url.pathname,
							handlerDurationMs.toFixed(2),
							sessionId
						);

						// Check if this is a streaming response that needs deferred finalization
						const streamDone = (c as any).get(STREAM_DONE_PROMISE_KEY) as
							| Promise<void>
							| undefined;
						const isStreaming = Boolean((c as any).get(IS_STREAMING_RESPONSE_KEY));

						// Check if this is a WebSocket response that needs deferred finalization
						const wsDone = (c as any).get(WS_DONE_PROMISE_KEY) as Promise<void> | undefined;

						// Check if Hono caught an error (c.error is set by Hono's error handler)
						// or if the response status indicates an error
						const honoError = (c as any).error as Error | undefined;
						responseStatus = c.res?.status ?? 200;
						const isError = honoError || responseStatus >= 500;

						internal.info(
							'[request] %s %s - status: %d, streaming: %s, websocket: %s, error: %s (session: %s)',
							method,
							url.pathname,
							responseStatus,
							isStreaming,
							Boolean(wsDone),
							isError,
							sessionId
						);

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
							internal.info(
								'[request] %s %s - streaming response, deferring finalization (session: %s)',
								method,
								url.pathname,
								sessionId
							);

							// For streaming, we end the span inside waitUntil after setting attributes
							shouldEndSpanInFinally = false;

							// Capture pending promises BEFORE adding finalization waitUntil to avoid deadlock
							const pendingPromises = handler.getPendingSnapshot();
							const hasPendingTasks = pendingPromises.length > 0;

							if (hasPendingTasks) {
								internal.info(
									'[request] %s %s - %d pending waitUntil tasks to wait for after stream (session: %s)',
									method,
									url.pathname,
									pendingPromises.length,
									sessionId
								);
							}

							// Capture values needed for span attributes (responseStatus already captured above)
							const capturedResponseStatus = responseStatus;
							const capturedErrorMessage = errorMessage;

							// Use waitUntil to handle stream completion and finalization
							// This runs AFTER the response is sent to the client
							// Note: We intentionally do NOT use noSpan here - the waitUntil span helps
							// track the streaming finalization work in telemetry
							handler.waitUntil(async () => {
								// Track if stream ended with error so we can update finalization status
								let streamError: unknown;

								try {
									await streamDone;
									internal.info(
										'[request] %s %s - stream completed (session: %s)',
										method,
										url.pathname,
										sessionId
									);
								} catch (ex) {
									streamError = ex;
									internal.info(
										'[request] %s %s - stream ended with error: %s (session: %s)',
										method,
										url.pathname,
										ex,
										sessionId
									);
								}

								// Record duration now that stream is complete - set attributes BEFORE ending span
								const streamDurationMs = performance.now() - requestStartTime;
								const durationNs = Math.round(streamDurationMs * 1_000_000);
								internal.info(
									'[request] %s %s - recording stream duration: %sms (session: %s)',
									method,
									url.pathname,
									streamDurationMs.toFixed(2),
									sessionId
								);

								// Determine final status - use stream error if present
								const finalStatus = streamError ? 500 : capturedResponseStatus;
								const finalErrorMessage = streamError
									? streamError instanceof Error
										? (streamError.stack ?? streamError.message)
										: String(streamError)
									: capturedErrorMessage;

								try {
									// Wait for pending tasks (evals, etc.) captured BEFORE this waitUntil was added
									if (hasPendingTasks) {
										internal.info(
											'[request] %s %s - waiting for %d pending waitUntil tasks (session: %s)',
											method,
											url.pathname,
											pendingPromises.length,
											sessionId
										);
										const logger = c.get('logger');
										await handler.waitForPromises(pendingPromises, logger, sessionId);
										internal.info(
											'[request] %s %s - all waitUntil tasks complete (session: %s)',
											method,
											url.pathname,
											sessionId
										);
									}

									// Finalize session after stream completes and evals finish
									await finalizeSession(
										finalStatus >= 500 ? finalStatus : undefined,
										finalErrorMessage
									);
									internal.info(
										'[request] %s %s - stream session finalization complete (session: %s)',
										method,
										url.pathname,
										sessionId
									);
								} finally {
									// Set span attributes and end span AFTER all work is done
									span.setAttribute('@agentuity/request.duration', durationNs);
									span.setAttribute('http.status_code', finalStatus);

									// Set span status based on whether there was an error
									if (streamError) {
										span.setStatus({
											code: SpanStatusCode.ERROR,
											message: finalErrorMessage ?? 'Stream ended with error',
										});
										if (streamError instanceof Error) {
											span.recordException(streamError);
										}
									} else {
										span.setStatus({ code: SpanStatusCode.OK });
									}

									span.end();
									internal.info(
										'[request] %s %s - stream span ended (session: %s)',
										method,
										url.pathname,
										sessionId
									);
									// Note: We don't call waitUntilAll() here because this waitUntil callback
									// IS the final cleanup task. Calling waitUntilAll() would deadlock since
									// it would wait for this very promise to complete.
								}
							});
						} else if (wsDone) {
							// WebSocket connection — defer finalization until onClose fires
							internal.info(
								'[request] %s %s - websocket response, deferring finalization until close (session: %s)',
								method,
								url.pathname,
								sessionId
							);

							// For WebSocket, we end the span inside waitUntil after the connection closes
							shouldEndSpanInFinally = false;

							// Capture pending promises BEFORE adding finalization waitUntil to avoid deadlock
							const pendingPromises = handler.getPendingSnapshot();
							const hasPendingTasks = pendingPromises.length > 0;

							if (hasPendingTasks) {
								internal.info(
									'[request] %s %s - %d pending waitUntil tasks to wait for after websocket close (session: %s)',
									method,
									url.pathname,
									pendingPromises.length,
									sessionId
								);
							}

							// Capture values needed for span attributes
							const capturedResponseStatus = responseStatus;
							const capturedErrorMessage = errorMessage;

							// Use waitUntil to handle WebSocket close and finalization
							handler.waitUntil(async () => {
								let wsError: unknown;

								try {
									await wsDone;
									internal.info(
										'[request] %s %s - websocket closed (session: %s)',
										method,
										url.pathname,
										sessionId
									);
								} catch (ex) {
									wsError = ex;
									internal.info(
										'[request] %s %s - websocket closed with error: %s (session: %s)',
										method,
										url.pathname,
										ex,
										sessionId
									);
								}

								// Record duration now that WebSocket is closed
								const wsDurationMs = performance.now() - requestStartTime;
								const durationNs = Math.round(wsDurationMs * 1_000_000);
								internal.info(
									'[request] %s %s - recording websocket duration: %sms (session: %s)',
									method,
									url.pathname,
									wsDurationMs.toFixed(2),
									sessionId
								);

								// Determine final status
								const finalStatus = wsError ? 500 : capturedResponseStatus;
								const finalErrorMessage = wsError
									? wsError instanceof Error
										? (wsError.stack ?? wsError.message)
										: String(wsError)
									: capturedErrorMessage;

								try {
									// Wait for pending tasks captured BEFORE this waitUntil was added
									if (hasPendingTasks) {
										internal.info(
											'[request] %s %s - waiting for %d pending waitUntil tasks (session: %s)',
											method,
											url.pathname,
											pendingPromises.length,
											sessionId
										);
										const logger = c.get('logger');
										await handler.waitForPromises(pendingPromises, logger, sessionId);
										internal.info(
											'[request] %s %s - all waitUntil tasks complete (session: %s)',
											method,
											url.pathname,
											sessionId
										);
									}

									// Finalize session after WebSocket closes
									await finalizeSession(
										finalStatus >= 500 ? finalStatus : undefined,
										finalErrorMessage
									);
									internal.info(
										'[request] %s %s - websocket session finalization complete (session: %s)',
										method,
										url.pathname,
										sessionId
									);
								} finally {
									// Set span attributes and end span AFTER all work is done
									span.setAttribute('@agentuity/request.duration', durationNs);
									span.setAttribute('http.status_code', finalStatus);

									if (wsError) {
										span.setStatus({
											code: SpanStatusCode.ERROR,
											message: finalErrorMessage ?? 'WebSocket ended with error',
										});
										if (wsError instanceof Error) {
											span.recordException(wsError);
										}
									} else {
										span.setStatus({ code: SpanStatusCode.OK });
									}

									span.end();
									internal.info(
										'[request] %s %s - websocket span ended (session: %s)',
										method,
										url.pathname,
										sessionId
									);
								}
							});
						} else {
							// Non-streaming: record duration immediately
							const durationNs = Math.round(handlerDurationMs * 1_000_000);
							internal.info(
								'[request] %s %s - recording duration: %sms (%dns) (session: %s)',
								method,
								url.pathname,
								handlerDurationMs.toFixed(2),
								durationNs,
								sessionId
							);
							span.setAttribute('@agentuity/request.duration', durationNs);
							span.setAttribute('http.status_code', responseStatus);

							// Capture pending promises BEFORE adding finalization waitUntil to avoid deadlock.
							// If we called waitUntilAll inside waitUntil, it would wait for itself.
							const pendingPromises = handler.getPendingSnapshot();
							const hasPendingTasks = pendingPromises.length > 0;

							if (hasPendingTasks) {
								internal.info(
									'[request] %s %s - %d pending waitUntil tasks to wait for (session: %s)',
									method,
									url.pathname,
									pendingPromises.length,
									sessionId
								);
							}

							// Capture values for use in waitUntil callback
							const capturedResponseStatus = responseStatus;
							const capturedErrorMessage = errorMessage;

							// Defer session finalization to run AFTER response is sent
							// Use noSpan: true since finalizeSession creates its own Session End span
							handler.waitUntil(
								async () => {
									// Wait for the snapshot of pending tasks (evals, etc.) captured BEFORE this waitUntil was added
									if (hasPendingTasks) {
										internal.info(
											'[request] %s %s - waiting for %d pending waitUntil tasks (session: %s)',
											method,
											url.pathname,
											pendingPromises.length,
											sessionId
										);
										const logger = c.get('logger');
										await handler.waitForPromises(pendingPromises, logger, sessionId);
										internal.info(
											'[request] %s %s - all waitUntil tasks complete (session: %s)',
											method,
											url.pathname,
											sessionId
										);
									}

									// Finalize session - this is the actual work
									internal.info(
										'[request] %s %s - starting session finalization (session: %s)',
										method,
										url.pathname,
										sessionId
									);
									try {
										await finalizeSession(
											capturedResponseStatus >= 500 ? capturedResponseStatus : undefined,
											capturedErrorMessage
										);
										internal.info(
											'[request] %s %s - session finalization complete (session: %s)',
											method,
											url.pathname,
											sessionId
										);
									} catch (ex) {
										internal.error(
											'[request] %s %s - session finalization failed: %s (session: %s)',
											method,
											url.pathname,
											ex,
											sessionId
										);
									}
									// Note: We don't call waitUntilAll() here because this waitUntil callback
									// IS the final cleanup task. Calling waitUntilAll() would deadlock since
									// it would wait for this very promise to complete.
								},
								{ noSpan: true }
							);
						}
					} catch (ex) {
						// Record request metrics even on exceptions (500 status)
						const exceptionDurationMs = performance.now() - requestStartTime;
						const durationNs = Math.round(exceptionDurationMs * 1_000_000);
						internal.info(
							'[request] %s %s - recording exception duration: %sms (session: %s)',
							method,
							url.pathname,
							exceptionDurationMs.toFixed(2),
							sessionId
						);
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

						// Capture error message for use in waitUntil callback
						const capturedErrorMessage = errorMessage;

						// Capture pending promises BEFORE adding finalization waitUntil to avoid deadlock
						const pendingPromises = handler.getPendingSnapshot();
						const hasPendingTasks = pendingPromises.length > 0;

						if (hasPendingTasks) {
							internal.info(
								'[request] %s %s - %d pending waitUntil tasks to wait for after error (session: %s)',
								method,
								url.pathname,
								pendingPromises.length,
								sessionId
							);
						}

						// Still defer finalization even on error
						// Use noSpan: true since finalizeSession creates its own Session End span
						handler.waitUntil(
							async () => {
								// Wait for pending tasks (evals, etc.) captured BEFORE this waitUntil was added
								if (hasPendingTasks) {
									internal.info(
										'[request] %s %s - waiting for %d pending waitUntil tasks (session: %s)',
										method,
										url.pathname,
										pendingPromises.length,
										sessionId
									);
									const logger = c.get('logger');
									await handler.waitForPromises(pendingPromises, logger, sessionId);
									internal.info(
										'[request] %s %s - all waitUntil tasks complete (session: %s)',
										method,
										url.pathname,
										sessionId
									);
								}

								try {
									await finalizeSession(500, capturedErrorMessage);
								} catch (finalizeEx) {
									internal.error(
										'[request] %s %s - error session finalization failed: %s (session: %s)',
										method,
										url.pathname,
										finalizeEx,
										sessionId
									);
								}
								// Note: We don't call waitUntilAll() here because this waitUntil callback
								// IS the final cleanup task. Calling waitUntilAll() would deadlock since
								// it would wait for this very promise to complete.
							},
							{ noSpan: true }
						);

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

						internal.info(
							'[request] %s %s - response ready, duration: %sms (session: %s)',
							method,
							url.pathname,
							handlerDurationMs.toFixed(2),
							sessionId
						);

						// Only end span here for non-streaming responses
						// For streaming, span is ended in the waitUntil callback after setting duration attributes
						if (shouldEndSpanInFinally) {
							span.end();
						}
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
