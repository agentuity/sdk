/* eslint-disable @typescript-eslint/no-explicit-any */
import { type Env as HonoEnv } from 'hono';
import type { cors } from 'hono/cors';
import type { compress } from 'hono/compress';
import type { Logger } from '@agentuity/otel';
import type { Meter, Tracer } from '@opentelemetry/api';
import type {
	KeyValueStorage,
	StreamStorage,
	VectorStorage,
	SandboxService,
	QueueService,
	EmailService,
	ScheduleService,
	TaskStorage,
} from '@agentuity/core';

import type { Session, Thread } from './session';
import type WaitUntilHandler from './_waituntil';
import type { Context } from 'hono';

type HonoCorsOptions = NonNullable<Parameters<typeof cors>[0]>;
type HonoCompressOptions = Parameters<typeof compress>[0];

/**
 * Agentuity-specific CORS options for same-origin restriction.
 */
export interface AgentuityCorsSameOriginOptions {
	sameOrigin?: boolean;
	allowedOrigins?: string[];
}

export type CorsConfig = HonoCorsOptions & AgentuityCorsSameOriginOptions;

export interface CompressionConfig {
	enabled?: boolean;
	threshold?: number;
	filter?: (c: Context) => boolean;
	honoOptions?: HonoCompressOptions;
}

export interface AnalyticsOptions {
	enabled?: boolean;
	requireConsent?: boolean;
	trackClicks?: boolean;
	trackScroll?: boolean;
	trackOutboundLinks?: boolean;
	trackForms?: boolean;
	trackWebVitals?: boolean;
	trackErrors?: boolean;
	trackSPANavigation?: boolean;
	sampleRate?: number;
	excludePatterns?: string[];
	globalProperties?: Record<string, unknown>;
}

export interface WorkbenchOptions {
	route?: string;
	headers?: Record<string, string>;
}

export interface AppConfig {
	cors?: CorsConfig;
	compression?: CompressionConfig | false;
	services?: {
		useLocal?: boolean;
		keyvalue?: KeyValueStorage;
		stream?: StreamStorage;
		vector?: VectorStorage;
		task?: TaskStorage;
		thread?: import('./session').ThreadProvider;
		session?: import('./session').SessionProvider;
		sessionEvent?: import('@agentuity/core').SessionEventProvider;
		evalRunEvent?: import('@agentuity/core').EvalRunEventProvider;
		email?: EmailService;
	};
	requestTimeout?: number;
	analytics?: boolean | AnalyticsOptions;
	workbench?: boolean | string | WorkbenchOptions;
	router?: import('hono').Hono<any, any, any> | RouteMount | RouteMount[];
	agents?: import('./agent').AgentRunner<any, any, any>[];
}

export interface RouteMount {
	path: string;
	router: import('hono').Hono<any, any, any>;
}

export interface Variables<TAppState = Record<string, never>> {
	logger: Logger;
	meter: Meter;
	tracer: Tracer;
	sessionId: string;
	thread: Thread;
	session: Session;
	kv: KeyValueStorage;
	stream: StreamStorage;
	vector: VectorStorage;
	sandbox: SandboxService;
	queue: QueueService;
	email: EmailService;
	schedule: ScheduleService;
	task: TaskStorage;
	app: TAppState;
	_webThreadId?: string;
}

export type TriggerType = import('@agentuity/core').SessionStartEvent['trigger'];

export interface PrivateVariables {
	waitUntilHandler: WaitUntilHandler;
	routeId?: string;
	agentIds: Set<string>;
	trigger: TriggerType;
	agentRunSpanId?: string;
}

export interface Env<TAppState = Record<string, never>> extends HonoEnv {
	Variables: Variables<TAppState>;
}

export function getApp(): null {
	return null;
}

export { fireEvent } from './_events';

import type { Hono } from 'hono';

export interface Server {
	url: string;
}

export interface AppResult {
	config?: AppConfig;
	router: import('hono').Hono<Env>;
	server: Server;
	logger: Logger;
	fetch: (req: Request, ...args: any[]) => Response | Promise<Response>;
	port: number;
	hostname: string;
	websocket?: any;
}

/**
 * Create and start an Agentuity application.
 *
 * Uses @agentuity/hono's agentuity() middleware for OTel and services.
 *
 * @example
 * ```typescript
 * import { createApp } from '@agentuity/runtime';
 * import router from './src/api/router';
 * import agents from './src/agent';
 *
 * export default await createApp({
 *   router: { path: '/api', router },
 *   agents,
 * });
 * ```
 */
export async function createApp(config?: AppConfig): Promise<AppResult> {
	// --- Imports (lazy to avoid circular deps) ---
	const { bootstrapRuntimeEnv } = await import('@agentuity/server');
	const { agentuity } = await import('@agentuity/hono');
	const { getOtel } = await import('@agentuity/hono');
	const { setGlobalLogger, setGlobalTracer, setGlobalRouter } = await import('./_server');
	const { createBaseMiddleware, createCorsMiddleware, createCompressionMiddleware } = await import(
		'./middleware'
	);
	const { createAgentMiddleware, runAgentSetups } = await import('./agent');
	const { loadBuildMetadata } = await import('./_metadata');
	const { patchBunS3ForStorageDev } = await import('./bun-s3-patch');
	const { createWorkbenchRouter } = await import('./workbench');
	const {
		isDevelopment,
		resolveAnalyticsConfig,
		resolveWorkbenchConfig,
		registerHealthRoutes,
		registerAnalyticsRoutes,
		registerWebRoutes,
		registerWorkbenchUI,
		startServer,
	} = await import('./bootstrap');
	const { websocket } = await import('hono/bun');

	// --- Step 0: Environment ---
	if (isDevelopment()) {
		bootstrapRuntimeEnv();
	}
	if (isDevelopment() && process.env.AGENTUITY_NO_BUNDLE === 'true') {
		const { applyDevPatches } = await import('./dev-patches');
		await applyDevPatches();
	}
	loadBuildMetadata();
	patchBunS3ForStorageDev();

	// --- Step 1: Router + agentuity middleware (OTel only for now) ---
	const { createRouter } = await import('./router');
	const app = createRouter();
	setGlobalRouter(app);

	// Apply agentuity middleware (OTel initialization)
	// Note: Services are still created below via createServices() for now
	// until local services, thread/session providers are migrated
	app.use('*', agentuity());

	// Get the initialized OTel instance for globals
	const otel = getOtel();
	if (otel) {
		setGlobalLogger(otel.logger);
		setGlobalTracer(otel.tracer);
	}

	// Additional middleware
	app.use('*', createCompressionMiddleware(config?.compression));
	app.use(
		'*',
		createBaseMiddleware({ logger: otel!.logger, tracer: otel!.tracer, meter: otel!.meter })
	);

	// --- Step 2: Services (thread/session providers still needed) ---
	const port = process.env.PORT || '3500';
	const serverUrl = `http://127.0.0.1:${port}`;
	const { createServices, getThreadProvider, getSessionProvider } = await import('./_services');
	createServices(otel!.logger, config, serverUrl);

	const threadProvider = getThreadProvider();
	const sessionProvider = getSessionProvider();
	await threadProvider.initialize({});
	await sessionProvider.initialize({});

	// --- Step 3: Routes ---
	const analyticsConfig = resolveAnalyticsConfig(config?.analytics);
	const workbenchConfig = resolveWorkbenchConfig(config?.workbench);

	registerHealthRoutes(app);

	if (analyticsConfig.enabled) {
		registerAnalyticsRoutes(app, analyticsConfig);
	}

	// Mount user routers
	if (config?.router) {
		const mounts = normalizeRouterConfig(config.router);
		for (const mount of mounts) {
			const prefix = mount.path.endsWith('/') ? mount.path + '*' : mount.path + '/*';
			app.use(prefix, createCorsMiddleware(config?.cors));
			app.use(prefix, createAgentMiddleware(''));
			app.route(mount.path, mount.router);
		}
	}

	// Workbench
	const workbenchRouter = createWorkbenchRouter();
	app.route('/', workbenchRouter);
	registerWorkbenchUI(app, workbenchConfig);

	// Web (production static serving)
	registerWebRoutes(app, analyticsConfig);

	// --- Step 4: Agent lifecycle + server ---
	await runAgentSetups({});

	// In dev mode with --hot, Bun manages the server via the default export's
	// `fetch` property. In production, we start Bun.serve() explicitly.
	if (!isDevelopment()) {
		startServer(app, { requestTimeout: config?.requestTimeout });
	}

	// Only log on first startup, not on --hot reloads
	const { serverStarted } = await import('./_globals');
	if (!serverStarted.get()) {
		serverStarted.set(true);
		otel!.logger.debug('Server listening on http://127.0.0.1:%s', process.env.PORT || '3500');
	}

	const portNumber = parseInt(process.env.PORT || '3500', 10);

	const result: AppResult = {
		config,
		router: app as Hono<Env>,
		server: { url: `http://127.0.0.1:${portNumber}` },
		logger: otel!.logger,
		fetch: app.fetch,
		port: portNumber,
		hostname: '127.0.0.1',
		websocket,
	};

	// In production, startServer() already called Bun.serve(). Strip fetch/port
	// so only the explicit Bun.serve() is active.
	if (!isDevelopment()) {
		delete (result as unknown as Record<string, unknown>).fetch;
		delete (result as unknown as Record<string, unknown>).port;
		delete (result as unknown as Record<string, unknown>).hostname;
		delete (result as unknown as Record<string, unknown>).websocket;
	}

	return result;
}

function normalizeRouterConfig(
	router: import('hono').Hono<any, any, any> | RouteMount | RouteMount[]
): RouteMount[] {
	if (Array.isArray(router)) {
		return router;
	}
	if ('router' in router && 'path' in router) {
		return [router as RouteMount];
	}
	return [{ path: '/api', router: router as import('hono').Hono<any, any, any> }];
}

export type ShutdownHook = () => Promise<void> | void;

function getShutdownHooks(): ShutdownHook[] {
	const key = Symbol.for('@agentuity/runtime:shutdown-hooks');
	const g = globalThis as any;
	if (!g[key]) {
		g[key] = [];
	}
	return g[key];
}

export function registerShutdownHook(hook: ShutdownHook): () => void {
	const hooks = getShutdownHooks();
	hooks.push(hook);
	return () => {
		const index = hooks.indexOf(hook);
		if (index !== -1) {
			hooks.splice(index, 1);
		}
	};
}

export async function runShutdown(): Promise<void> {
	const hooks = getShutdownHooks();
	for (let i = hooks.length - 1; i >= 0; i--) {
		const hook = hooks[i];
		if (!hook) continue;
		try {
			await hook();
		} catch {
			// Ignore errors during shutdown hooks
		}
	}
}
