// agent.ts exports
export {
	type AgentContext,
	type AgentEventName,
	type AgentEventCallback,
	type AgentRuntimeState,
	type CreateEvalConfig,
	type AgentValidator,
	type Agent,
	type CreateAgentConfig,
	type AgentRunner,
	getGlobalRuntimeState,
	getAgentRuntime,
	type AgentName,
	type AgentRegistry,
	registerAgent,
	setAgentConfig,
	getAgentConfig,
	type CreateAgentConfigExplicit,
	createAgent,
	populateAgentsRegistry,
	createAgentMiddleware,
	getAgents,
	runAgentSetups,
	runAgentShutdowns,
	runInAgentContext,
} from './agent';

// app.ts exports (all app-related functionality)
export {
	type AppConfig,
	type CompressionConfig,
	type Variables,
	type TriggerType,
	type PrivateVariables,
	type Env,
	type AppResult,
	createApp,
	getApp,
	getAppState,
	getAppConfig,
	runShutdown,
	fireEvent,
} from './app';
export { addEventListener, removeEventListener } from './_events';

// middleware.ts exports (Vite-native)
export {
	createBaseMiddleware,
	createCorsMiddleware,
	createOtelMiddleware,
	createCompressionMiddleware,
} from './middleware';

// Internal exports needed by generated entry files
export { register } from './otel/config';
export { createServices } from './_services';
export { enableProcessExitProtection } from './_process-protection';

// Internal exports (not in main index, imported by CLI only)
export { internalExit } from './_process-protection';

// devmode.ts exports
export { registerDevModeRoutes } from './devmode';

// router.ts exports
export { type HonoEnv, type WebSocketConnection, createRouter } from './router';

// protocol handler exports (websocket, sse, stream, cron)
export {
	websocket,
	type WebSocketHandler,
	sse,
	type SSEMessage,
	type SSEStream,
	type SSEHandler,
	stream,
	type StreamHandler,
	cron,
	type CronHandler,
	type CronMetadata,
} from './handlers';

// eval.ts exports
export {
	EvalHandlerResultSchema,
	type EvalContext,
	type EvalRunResultMetadata,
	type EvalHandlerResult,
	type EvalRunResultSuccess,
	type EvalRunResultError,
	type EvalRunResult,
	type CreateEvalRunRequest,
	type ExternalEvalMetadata,
	type EvalMetadata,
	type EvalFunction,
	type Eval,
} from './eval';

// session.ts exports
export {
	type ThreadEventName,
	type SessionEventName,
	type Thread,
	type Session,
	type ThreadIDProvider,
	type ThreadProvider,
	type SessionProvider,
	generateId,
	DefaultThreadIDProvider,
	DefaultThread,
} from './session';

// services/thread/local exports
export { LocalThreadProvider } from './services/thread/local';

// workbench.ts exports
export {
	createWorkbenchExecutionRoute,
	createWorkbenchRouter,
	createWorkbenchMetadataRoute,
	createWorkbenchWebsocketRoute,
} from './workbench';

// web.ts exports
export { createWebRouter } from './web';

// validator.ts exports
export { type RouteValidator, validator } from './validator';

// logger exports
export type { Logger } from './logger';

// _server.ts exports
export {
	getRouter,
	setGlobalRouter,
	createLogger,
	getLogger,
	setGlobalLogger,
	getTracer,
	setGlobalTracer,
	addSpanProcessor,
	getSpanProcessors,
	privateContext,
	notifyReady,
	getServer,
	AGENT_CONTEXT_PROPERTIES,
} from './_server';

// _waituntil.ts exports
export { hasWaitUntilPending } from './_waituntil';

// _context.ts exports (for auth integration)
export { inAgentContext, inHTTPContext, getAgentContext, getHTTPContext } from './_context';

// _standalone.ts exports
export {
	createAgentContext,
	StandaloneAgentContext,
	type StandaloneContextOptions,
	type InvokeOptions,
} from './_standalone';

// services/evalrun exports
export {
	HTTPEvalRunEventProvider,
	LocalEvalRunEventProvider,
	JSONEvalRunEventProvider,
	CompositeEvalRunEventProvider,
} from './services/evalrun';

// _services.ts exports
export { getEvalRunEventProvider, getThreadProvider, getSessionProvider } from './_services';

// _validation.ts exports
export type { RouteSchema, GetRouteSchema } from './_validation';

/**
 * Application state interface that gets automatically augmented based on your createApp setup function.
 *
 * This interface is empty by default but gets populated with strongly-typed properties
 * when you define a setup function in createApp(). The Agentuity build tool automatically
 * generates type augmentations in `.agentuity/.agentuity_runtime.ts`.
 *
 * **How it works:**
 * 1. You define setup() in createApp() that returns an object
 * 2. The build tool generates module augmentation for this interface
 * 3. All agents get strongly-typed access to app state via `ctx.app`
 *
 * @example
 * ```typescript
 * // In your app.ts:
 * const app = await createApp({
 *   setup: async () => {
 *     const db = await connectDatabase();
 *     const redis = await connectRedis();
 *     return { db, redis };
 *   }
 * });
 *
 * // In your agent:
 * const agent = createAgent('user-query', {
 *   handler: async (ctx, input) => {
 *     // ctx.app is strongly typed with { db, redis }!
 *     const user = await ctx.app.db.query('SELECT * FROM users');
 *     await ctx.app.redis.set('key', 'value');
 *     return user;
 *   }
 * });
 * ```
 *
 * **Note:** If you're not seeing type hints for `ctx.app`, make sure you've run `bun run build`
 * to generate the type augmentations.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface AppState {}

// Re-export bootstrapRuntimeEnv from @agentuity/server for convenience
// This allows generated code to import from @agentuity/runtime instead of having
// a direct dependency on @agentuity/server
export { bootstrapRuntimeEnv, type RuntimeBootstrapOptions } from '@agentuity/server';
