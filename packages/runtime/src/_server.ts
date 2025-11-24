import {
	context,
	SpanKind,
	SpanStatusCode,
	type Context,
	type Tracer,
	trace,
	type Attributes,
	propagation,
} from '@opentelemetry/api';
import { TraceState } from '@opentelemetry/core';
import type { Span } from '@opentelemetry/sdk-trace-base';
import type { SpanProcessor } from '@opentelemetry/sdk-trace-base';
import { type LogLevel, ServiceException } from '@agentuity/core';
import { cors } from 'hono/cors';
import { createMiddleware } from 'hono/factory';
import { Hono, type Context as HonoContext } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { BunWebSocketData } from 'hono/bun';
import { matchedRoutes } from 'hono/route';
import { websocket } from 'hono/bun';
import { join } from 'node:path';
import type { AppConfig, Env, PrivateVariables } from './app';
import { extractTraceContextFromRequest } from './otel/http';
import { register } from './otel/config';
import type { Logger } from './logger';
import { isIdle } from './_idle';
import * as runtimeConfig from './_config';
import { inAgentContext, getAgentContext, runInHTTPContext } from './_context';
import {
	createServices,
	getThreadProvider,
	getSessionProvider,
	getSessionEventProvider,
} from './_services';
import { generateId } from './session';
import WaitUntilHandler from './_waituntil';
import registerTokenProcessor, { TOKENS_HEADER } from './_tokens';

const SESSION_HEADER = 'x-session-id';

let globalServerInstance: Bun.Server<BunWebSocketData> | null = null;

let globalRouterInstance: Hono<Env> | null = null;

let globalLogger: Logger | null = null;
let globalTracer: Tracer | null = null;

export function getServer() {
	return globalServerInstance;
}

export function getRouter() {
	return globalRouterInstance;
}

// Workbench routing is now handled by the bundle plugin

export function getLogger() {
	return globalLogger;
}

export function getTracer() {
	return globalTracer;
}

function isDevelopment(): boolean {
	const devmode = runtimeConfig.isDevMode();
	const environment = runtimeConfig.getEnvironment();
	return devmode || environment === 'development';
}

function getPort(): number {
	return Number.parseInt(process.env.AGENTUITY_PORT ?? process.env.PORT ?? '3500', 10) || 3500;
}

const spanProcessors: SpanProcessor[] = [];

/**
 * add a custom span processor that will be added to the otel configuration. this method must be
 * called before the createApp is called for it to be added.
 */
export function addSpanProcessor(processor: SpanProcessor) {
	spanProcessors.push(processor);
}

function registerAgentuitySpanProcessor() {
	const orgId = runtimeConfig.getOrganizationId();
	const projectId = runtimeConfig.getProjectId();
	const deploymentId = runtimeConfig.getDeploymentId();
	const devmode = runtimeConfig.isDevMode();
	const environment = runtimeConfig.getEnvironment();

	class RegisterAgentSpanProcessor implements SpanProcessor {
		onStart(span: Span, _context: Context) {
			const attrs: Attributes = {
				'@agentuity/orgId': orgId,
				'@agentuity/projectId': projectId,
				'@agentuity/deploymentId': deploymentId,
				'@agentuity/devmode': devmode,
				'@agentuity/environment': environment,
			};
			if (inAgentContext()) {
				const agentCtx = getAgentContext();
				if (agentCtx.current?.metadata) {
					attrs['@agentuity/agentId'] = agentCtx.current.metadata.id;
					attrs['@agentuity/agentIdentifier'] = agentCtx.current.metadata.agentId;
					attrs['@agentuity/agentDescription'] = agentCtx.current.metadata.description;
					attrs['@agentuity/agentName'] = agentCtx.current.metadata.name;
				}
			}
			span.setAttributes(attrs);
		}

		onEnd(_span: Span) {
			return;
		}

		forceFlush() {
			return Promise.resolve();
		}

		shutdown() {
			return Promise.resolve();
		}
	}
	addSpanProcessor(new RegisterAgentSpanProcessor());
}

export function privateContext<E extends Env>(c: HonoContext<E>) {
	return c as unknown as HonoContext<{ Variables: PrivateVariables }>;
}

export const createServer = <E extends Env>(router: Hono<E>, config?: AppConfig) => {
	if (globalServerInstance) {
		return globalServerInstance;
	}

	const logLevel = process.env.AGENTUITY_LOG_LEVEL || 'info';
	const port = getPort();
	const hostname = '127.0.0.1';
	const serverUrl = `http://${hostname}:${port}`;

	// this must come before registering any otel stuff
	registerAgentuitySpanProcessor();
	registerTokenProcessor();

	// Create the telemetry and logger
	const otel = register({ processors: spanProcessors, logLevel: logLevel as LogLevel });

	// Create services (may return local router)
	const servicesResult = createServices(otel.logger, config, serverUrl);

	const server = Bun.serve({
		hostname,
		development: isDevelopment(),
		fetch: router.fetch,
		idleTimeout: 0,
		port,
		websocket,
	});

	globalRouterInstance = router as unknown as Hono<Env>;
	globalServerInstance = server;
	globalLogger = otel.logger;
	globalTracer = otel.tracer;

	let isShutdown = false;

	router.onError((error, _c) => {
		if (error instanceof HTTPException) {
			otel.logger.error('HTTP Error: %s (%d)', error.cause, error.status);
			return error.getResponse();
		}
		if (error.name === 'UnauthenticatedError') {
			otel.logger.error('Unauthenticated Error: %s', error.message);
			return new Response(error.message, { status: 501 });
		}
		if (
			error instanceof ServiceException ||
			('statusCode' in error && typeof error.statusCode === 'number')
		) {
			const serviceError = error as ServiceException;
			otel.logger.error(
				'Service Exception: %s (%s returned HTTP status code: %d)',
				error.message,
				serviceError.url,
				serviceError.statusCode
			);
			return new Response(error.message, {
				status: serviceError.statusCode ?? 500,
			});
		}
		otel.logger.error('Unhandled Server Error: %s', JSON.stringify(error));
		return new Response('Internal Server Error', { status: 500 });
	});

	const threadProvider = getThreadProvider();
	const sessionProvider = getSessionProvider();

	let initPromise: Promise<void> | undefined = new Promise((resolve, reject) => {
		Promise.all([threadProvider.initialize(), sessionProvider.initialize()])
			.then(() => resolve())
			.catch(reject);
	});

	router.use(async (c, next) => {
		if (initPromise) {
			await initPromise;
			initPromise = undefined;
		}
		c.set('logger', otel.logger);
		c.set('tracer', otel.tracer);
		c.set('meter', otel.meter);
		const isWebSocket = c.req.header('upgrade')?.toLowerCase() === 'websocket';
		const skipLogging = c.req.path.startsWith('/_agentuity/');
		const started = performance.now();
		if (!skipLogging) {
			otel.logger.debug('%s %s started', c.req.method, c.req.path);
		}

		await runInHTTPContext(c, next);

		// Don't log completion for websocket upgrades - they stay open
		if (!skipLogging && !isWebSocket) {
			otel.logger.debug(
				'%s %s completed (%d) in %sms',
				c.req.method,
				c.req.path,
				c.res.status,
				Number(performance.now() - started).toFixed(2)
			);
		}
	});

	// setup the cors middleware
	router.use(
		'*',
		cors({
			origin: config?.cors?.origin ?? ((origin) => origin),
			allowHeaders: config?.cors?.allowHeaders ?? [
				'Content-Type',
				'Authorization',
				'Accept',
				'Origin',
				'X-Requested-With',
			],
			allowMethods: ['POST', 'GET', 'OPTIONS', 'HEAD', 'PUT', 'DELETE', 'PATCH'],
			exposeHeaders: ['Content-Length', TOKENS_HEADER, SESSION_HEADER, 'x-deployment'],
			maxAge: 600,
			credentials: true,
			...(config?.cors ?? {}), // allow the app config to override
		})
	);

	router.get('/_health', (c) => c.text('OK'));
	router.route('/_agentuity', createAgentuityAPIs());

	// Mount local storage router if using local services
	if (servicesResult?.localRouter) {
		router.route('/', servicesResult.localRouter);
	}

	// we create a middleware that attempts to match our routeid to the incoming route
	let routeMapping: Record<string, string>;
	const routePathMapper = createMiddleware<Env>(async (c, next) => {
		if (!routeMapping) {
			// Look for .routemapping.json in the project's .agentuity directory
			// This is where the build plugin writes it (build.config.outdir)
			const projectRoot = process.cwd();
			let routeMappingPath: string;
			if (projectRoot === '/home/agentuity/app') {
				// in production there is no .agentuity folder
				routeMappingPath = join(projectRoot, '.routemapping.json');
			} else {
				routeMappingPath = join(projectRoot, '.agentuity', '.routemapping.json');
			}
			const file = Bun.file(routeMappingPath);
			if (!(await file.exists())) {
				c.var.logger.fatal('error loading %s. this is a build issue!', routeMappingPath);
			}
			routeMapping = (await file.json()) as Record<string, string>;
		}
		const matches = matchedRoutes(c).filter(
			(m) => m.method !== 'ALL' && (m.path.startsWith('/api') || m.path.startsWith('/agent/'))
		);
		const _c = privateContext(c);
		if (matches.length > 0) {
			const method = c.req.method.toLowerCase();
			for (const m of matches) {
				const found = routeMapping[`${method} ${m.path}`];
				if (found) {
					_c.set('routeId', found);
					break;
				}
			}
		}
		_c.set('trigger', 'api'); // will get overwritten below if another trigger
		return next();
	});

	router.use('/agent/*', routePathMapper);
	router.use('/api/*', routePathMapper);

	// Attach services and agent registry to context for API routes
	router.use('/api/*', async (c, next) => {
		const { createAgentMiddleware } = await import('./agent');
		// Use a null agent name to just populate the agent registry without setting current agent
		return createAgentMiddleware('')(c, next);
	});

	// set the trigger for specific types
	for (const trigger of ['sms', 'email', 'cron'] as const) {
		const middleware = createMiddleware(async (c, next) => {
			const _c = privateContext(c);
			_c.set('trigger', trigger);
			await next();
		});
		router.use(`/api/${trigger}/*`, middleware);
		router.use(`/agent/${trigger}/*`, middleware);
	}

	router.use('/api/*', otelMiddleware);
	router.use('/agent/*', otelMiddleware);

	const shutdown = async () => {
		if (isShutdown) {
			return;
		}
		otel.logger.debug('shutdown started');
		isShutdown = true;
		// Force exit after timeout if cleanup hangs
		const forceExitTimer = setTimeout(() => {
			otel.logger.warn('shutdown timed out after 5s, forcing exit');
			process.exit(1);
		}, 5_000);
		try {
			await server.stop();
			await otel.shutdown();
			otel.logger.debug('shutdown completed');
		} finally {
			clearTimeout(forceExitTimer);
		}
	};

	process.on('beforeExit', async () => await shutdown());

	// Handle synchronous exit event - can't do async work here
	process.on('exit', (code) => {
		if (!isShutdown) {
			otel.logger.debug('process exiting with code %d before shutdown completed', code);
		}
	});

	process.once('SIGINT', async () => {
		await shutdown();
		process.exit(0);
	});
	process.once('SIGTERM', async () => {
		await shutdown();
		process.exit(0);
	});
	process.once('uncaughtException', async (err) => {
		otel.logger.error('An uncaught exception was received: %s', err);
		await shutdown();
		process.exit(1);
	});
	process.once('unhandledRejection', async (reason) => {
		otel.logger.error('An unhandled promise rejection was received: %s', reason);
		await shutdown();
		process.exit(1);
	});

	return server;
};

const createAgentuityAPIs = () => {
	const router = new Hono<Env>();
	router.get('idle', (c) => {
		if (isIdle()) {
			return c.text('OK', { status: 200 });
		}
		return c.text('NO', { status: 200 });
	});
	router.get('health', (c) => c.text('OK'));
	return router;
};

const otelMiddleware = createMiddleware<Env>(async (c, next) => {
	// Extract trace context from headers
	const extractedContext = extractTraceContextFromRequest(c.req.raw);

	const method = c.req.method;
	const url = new URL(c.req.url);
	const threadProvider = getThreadProvider();
	const sessionProvider = getSessionProvider();
	const sessionEventProvider = getSessionEventProvider();

	// Execute the request handler within the extracted context
	await context.with(extractedContext, async (): Promise<void> => {
		// Create a span for this incoming request
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

				// Add to tracestate
				let traceState = sctx.traceState ?? new TraceState();
				const projectId = runtimeConfig.getProjectId();
				const orgId = runtimeConfig.getOrganizationId();
				const deploymentId = runtimeConfig.getDeploymentId();
				const isDevMode = runtimeConfig.isDevMode();
				if (projectId) {
					traceState = traceState.set('pid', projectId);
				}
				if (orgId) {
					traceState = traceState.set('oid', orgId);
				}
				if (isDevMode) {
					traceState = traceState.set('d', '1');
				}
				sctx.traceState = traceState;

				const thread = await threadProvider.restore(c as unknown as HonoContext<Env>);
				const session = await sessionProvider.restore(thread, sessionId);
				const handler = new WaitUntilHandler(tracer);

				const _c = privateContext(c);
				const agentIds = new Set<string>();
				_c.set('agentIds', agentIds);

				const shouldSendSession = orgId && projectId && _c.var.routeId;
				let canSendSessionEvents = true;

				if (shouldSendSession) {
					await sessionEventProvider
						.start({
							id: sessionId,
							orgId,
							projectId,
							threadId: thread.id,
							routeId: _c.var.routeId,
							deploymentId,
							devmode: isDevMode,
							environment: runtimeConfig.getEnvironment(),
							method: c.req.method,
							url: c.req.url,
							trigger: _c.var.trigger,
						})
						.catch((ex) => {
							canSendSessionEvents = false;
							c.var.logger.error('error sending session start event: %s', ex);
						});
				}

				c.set('sessionId', sessionId);
				c.set('thread', thread);
				c.set('session', session);
				_c.set('waitUntilHandler', handler);

				let hasPendingWaits = false;

				try {
					await next();
					if (handler?.hasPending()) {
						hasPendingWaits = true;
						handler
							.waitUntilAll(c.var.logger, sessionId)
							.then(async () => {
								c.var.logger.debug('wait until finished for session %s', sessionId);
								await sessionProvider.save(session);
								await threadProvider.save(thread);
								span.setStatus({ code: SpanStatusCode.OK });
								if (shouldSendSession && canSendSessionEvents) {
									sessionEventProvider
										.complete({
											id: sessionId,
											statusCode: c.res.status,
											agentIds: Array.from(agentIds),
										})
										.then(() => {})
										.catch((ex) => c.var.logger.error(ex));
								}
							})
							.catch((ex) => {
								c.var.logger.error('wait until errored for session %s. %s', sessionId, ex);
								if (ex instanceof Error) {
									span.recordException(ex);
								}
								const message = (ex as Error).message ?? String(ex);
								span.setStatus({
									code: SpanStatusCode.ERROR,
									message,
								});
								c.var.logger.error(message);
								if (shouldSendSession && canSendSessionEvents) {
									sessionEventProvider
										.complete({
											id: sessionId,
											statusCode: c.res.status,
											error: message,
											agentIds: Array.from(agentIds),
										})
										.then(() => {})
										.catch((ex) => c.var.logger.error(ex));
								}
							})
							.finally(() => {
								span.end();
							});
					} else {
						span.setStatus({ code: SpanStatusCode.OK });
						if (shouldSendSession && canSendSessionEvents) {
							sessionEventProvider
								.complete({
									id: sessionId,
									statusCode: c.res.status,
									agentIds: Array.from(agentIds),
								})
								.then(() => {})
								.catch((ex) => c.var.logger.error(ex));
						}
					}
				} catch (ex) {
					if (ex instanceof Error) {
						span.recordException(ex);
					}
					const message = (ex as Error).message ?? String(ex);
					span.setStatus({
						code: SpanStatusCode.ERROR,
						message,
					});
					c.var.logger.error(message);
					if (shouldSendSession && canSendSessionEvents) {
						sessionEventProvider
							.complete({
								id: sessionId,
								statusCode: c.res.status,
								error: message,
								agentIds: Array.from(agentIds),
							})
							.then(() => {})
							.catch((ex) => c.var.logger.error(ex));
					}
					throw ex;
				} finally {
					// add otel headers into HTTP response
					const headers: Record<string, string> = {};
					propagation.inject(context.active(), headers);
					for (const key of Object.keys(headers)) {
						c.header(key, headers[key]);
					}
					// add session and deployment headers
					const traceId = sctx?.traceId || sessionId.replace(/^sess_/, '');
					c.header(SESSION_HEADER, `sess_${traceId}`);
					if (deploymentId) {
						c.header('x-deployment', deploymentId);
					}
					if (!hasPendingWaits) {
						try {
							await sessionProvider.save(session);
							await threadProvider.save(thread);
						} finally {
							span.end();
						}
					}
				}
			}
		);
	});
});
