import {
	context,
	SpanKind,
	SpanStatusCode,
	type Context,
	type Tracer,
	trace,
	type Attributes,
} from '@opentelemetry/api';
import type { Span } from '@opentelemetry/sdk-trace-base';
import type { SpanProcessor } from '@opentelemetry/sdk-trace-base';
import { type LogLevel, ServiceException } from '@agentuity/core';
import { cors } from 'hono/cors';
import { createMiddleware } from 'hono/factory';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { BunWebSocketData } from 'hono/bun';
import { websocket } from 'hono/bun';
import type { AppConfig, Env } from './app';
import { extractTraceContextFromRequest } from './otel/http';
import { register } from './otel/config';
import type { Logger } from './logger';
import { isIdle } from './_idle';
import * as runtimeConfig from './_config';
import { inAgentContext, getAgentContext } from './_context';
import { createServices } from './_services';

let globalServerInstance: Bun.Server<BunWebSocketData> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let globalAppInstance: Hono<any> | null = null;

let globalLogger: Logger | null = null;
let globalTracer: Tracer | null = null;

export function getServer() {
	return globalServerInstance;
}

export function getApp() {
	return globalAppInstance;
}

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
	return Number.parseInt(process.env.AGENTUITY_PORT ?? process.env.PORT ?? '3000') || 3000;
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
					attrs['@agentuity/agentName'] = agentCtx.current.metadata.name;
				}
			}
			span.setAttributes(attrs);
		}

		onEnd(_span: Span) {
			/* */
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

export const createServer = <E extends Env>(app: Hono<E>, config?: AppConfig) => {
	if (globalServerInstance) {
		return globalServerInstance;
	}

	const logLevel = process.env.AGENTUITY_LOG_LEVEL || 'info';
	const port = getPort();
	const hostname = '127.0.0.1';
	const serverUrl = `http://${hostname}:${port}`;

	// this must come before registering any otel stuff
	registerAgentuitySpanProcessor();

	// Create the telemetry and logger
	const otel = register({ processors: spanProcessors, logLevel: logLevel as LogLevel });

	// Create services (may return local router)
	const servicesResult = createServices(otel.logger, config, serverUrl);

	const server = Bun.serve({
		hostname,
		development: isDevelopment(),
		fetch: app.fetch,
		idleTimeout: 0,
		port,
		websocket,
	});

	globalAppInstance = app;
	globalServerInstance = server;
	globalLogger = otel.logger;
	globalTracer = otel.tracer;

	let isShutdown = false;

	app.onError((error, _c) => {
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
			otel.logger.error('Service Exception: %s (%d)', error.message, error.statusCode);
			return new Response(error.message, {
				status: (error.statusCode as number) ?? 500,
			});
		}
		otel.logger.error('Unhandled Server Error: %s', error);
		return new Response('Internal Server Error', { status: 500 });
	});

	app.use(async (c, next) => {
		c.set('logger', otel.logger);
		c.set('tracer', otel.tracer);
		c.set('meter', otel.meter);
		const isWebSocket = c.req.header('upgrade')?.toLowerCase() === 'websocket';
		const skipLogging = c.req.path.startsWith('/_agentuity/');
		const started = performance.now();
		if (!skipLogging) {
			otel.logger.debug('%s %s started', c.req.method, c.req.path);
		}
		await next();
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
	app.use(
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
			exposeHeaders: ['Content-Length'],
			maxAge: 600,
			credentials: true,
			...(config?.cors ?? {}), // allow the app config to override
		})
	);

	app.get('/_health', (c) => c.text('OK'));
	app.route('/_agentuity', createAgentuityAPIs());

	// Mount local storage router if using local services
	if (servicesResult?.localRouter) {
		app.route('/', servicesResult.localRouter);
	}

	// Attach services to context for API routes
	app.use('/api/*', async (c, next) => {
		const { registerServices } = await import('./_services');
		registerServices(c);
		await next();
	});

	app.use('/api/*', otelMiddleware);
	app.use('/agent/*', otelMiddleware);

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

	// Execute the request handler within the extracted context
	await context.with(extractedContext, async (): Promise<void> => {
		// Create a span for this incoming request
		await trace.getTracer('http-server').startActiveSpan(
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
				try {
					await next();
					span.setStatus({
						code: SpanStatusCode.OK,
					});
				} catch (ex) {
					if (ex instanceof Error) {
						span.recordException(ex);
					}
					const message = (ex as Error).message ?? String(ex);
					span.setStatus({
						code: SpanStatusCode.ERROR,
						message,
					});
					c.var.logger.error('ERROR: %s', message);
					throw ex;
				} finally {
					span.end();
				}
			}
		);
	});
});
