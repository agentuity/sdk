/* eslint-disable @typescript-eslint/no-unused-vars */
import { context, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import { createMiddleware } from 'hono/factory';
import { Hono } from 'hono';
import { BunWebSocketData, websocket } from 'hono/bun';
import type { AppConfig, Env } from './app';
import { extractTraceContextFromRequest } from './otel/http';
import { register } from './otel/config';
import type { Logger } from './logger';

let globalServerInstance: Bun.Server<BunWebSocketData> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let globalAppInstance: Hono<any> | null = null;

let globalLogger: Logger | null = null;

export function getServer() {
	return globalServerInstance;
}

export function getApp() {
	return globalAppInstance;
}

export function getLogger() {
	return globalLogger;
}

function isDevelopment(): boolean {
	const devmode = process.env.AGENTUITY_SDK_DEV_MODE === 'true';
	const environment = process.env.AGENTUITY_ENVIRONMENT || process.env.NODE_ENV || 'development';
	return devmode || environment === 'development';
}

function getPort(): number {
	return Number.parseInt(process.env.AGENTUITY_PORT ?? process.env.PORT ?? '3000') || 3000;
}

export const createServer = <E extends Env>(app: Hono<E>, _config?: AppConfig) => {
	if (globalServerInstance) {
		return globalServerInstance;
	}

	const server = Bun.serve({
		hostname: '127.0.0.1',
		development: isDevelopment(),
		fetch: app.fetch,
		idleTimeout: 0,
		port: getPort(),
		websocket,
	});

	const otel = register();

	globalAppInstance = app;
	globalServerInstance = server;
	globalLogger = otel.logger;

	let isShutdown = false;

	app.use(async (c, next) => {
		c.set('logger', otel.logger);
		c.set('tracer', otel.tracer);
		c.set('meter', otel.meter);
		const started = performance.now();
		otel.logger.debug('%s %s started', c.req.method, c.req.path);
		await next();
		otel.logger.debug(
			'%s %s completed (%d) in %sms',
			c.req.method,
			c.req.path,
			c.res.status,
			Number(performance.now() - started).toFixed(2)
		);
	});

	app.use('/api/*', otelMiddleware);
	app.use('/agent/*', otelMiddleware);

	const shutdown = async () => {
		if (isShutdown) {
			return;
		}
		otel.logger.info('shutdown started');
		isShutdown = true;
		// Force exit after timeout if cleanup hangs
		setTimeout(() => process.exit(1), 30_000).unref();
		await server.stop();
		await otel.shutdown();
		otel.logger.info('shutdown completed');
	};

	process.on('beforeExit', async () => await shutdown());
	process.on('exit', async () => await shutdown());
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
