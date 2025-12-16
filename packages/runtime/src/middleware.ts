/**
 * Middleware factories for Vite-native architecture
 * Extracted from _server.ts to be used by generated entry files
 */

import { createMiddleware } from 'hono/factory';
import { cors } from 'hono/cors';
import type { Env } from './app';
import type { Logger } from './logger';
import { generateId } from './session';
import { runInHTTPContext } from './_context';
import { DURATION_HEADER, TOKENS_HEADER } from './_tokens';
import { extractTraceContextFromRequest } from './otel/http';
import { context, SpanKind, SpanStatusCode, trace, propagation } from '@opentelemetry/api';
import { TraceState } from '@opentelemetry/core';
import * as runtimeConfig from './_config';

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
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	tracer: any;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	meter: any;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	corsOptions?: any;
}

/**
 * Create base middleware that sets up context variables
 */
export function createBaseMiddleware(config: MiddlewareConfig) {
	return createMiddleware<Env>(async (c, next) => {
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
 * Create CORS middleware
 */
export function createCorsMiddleware(corsOptions?: Parameters<typeof cors>[0]) {
	return cors({
		origin: corsOptions?.origin ?? ((origin) => origin),
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
}

/**
 * Create OpenTelemetry middleware for session/thread tracking
 * This is the critical middleware that creates AgentContext
 */
export function createOtelMiddleware() {
	return createMiddleware<Env>(async (c, next) => {
		// Import providers dynamically to avoid circular deps
		const { getThreadProvider, getSessionProvider } = await import('./_services');
		const WaitUntilHandler = (await import('./_waituntil')).default;

		const extractedContext = extractTraceContextFromRequest(c.req.raw);
		const method = c.req.method;
		const url = new URL(c.req.url);
		const threadProvider = getThreadProvider();
		const sessionProvider = getSessionProvider();
		// Session event provider not currently used in Vite-native mode
		// const sessionEventProvider = getSessionEventProvider();

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

					if (projectId) traceState = traceState.set('pid', projectId);
					if (orgId) traceState = traceState.set('oid', orgId);
					if (isDevMode) traceState = traceState.set('d', '1');
					sctx.traceState = traceState;

					const thread = await threadProvider.restore(c);
					const session = await sessionProvider.restore(thread, sessionId);
					const handler = new WaitUntilHandler(tracer);

					c.set('sessionId', sessionId);
					c.set('thread', thread);
					c.set('session', session);
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					(c as any).set('waitUntilHandler', handler);
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					(c as any).set('agentIds', new Set<string>());
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					(c as any).set('trigger', 'api');

					try {
						await next();

						// Save session/thread and send events
						await sessionProvider.save(session);
						await threadProvider.save(thread);
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

// Note: createAgentMiddleware is exported from agent.ts, not re-exported here
