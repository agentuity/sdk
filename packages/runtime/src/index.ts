// agent.ts exports
export {
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

// app.ts exports
export {
	type WorkbenchInstance,
	type AppConfig,
	type Variables,
	type TriggerType,
	type PrivateVariables,
	type Env,
	App,
	getApp,
	createApp,
	fireEvent,
} from './app';

// devmode.ts exports
export { registerDevModeRoutes } from './devmode';

// router.ts exports
export { type HonoEnv, type WebSocketConnection, createRouter } from './router';

// eval.ts exports
export {
	type EvalContext,
	type EvalRunResultMetadata,
	type EvalRunResultBinary,
	type EvalRunResultScore,
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

// workbench.ts exports
export {
	createWorkbenchExecutionRoute,
	createWorkbenchRouter,
	createWorkbenchMetadataRoute,
	createWorkbenchWebsocketRoute,
} from './workbench';

// validator.ts exports
export { type RouteValidator, validator } from './validator';

// logger exports
export type { Logger } from './logger';

// _server.ts exports
export { getRouter, getAppState, AGENT_CONTEXT_PROPERTIES } from './_server';

// _standalone.ts exports
export {
	createAgentContext,
	StandaloneAgentContext,
	type StandaloneContextOptions,
	type InvokeOptions,
} from './_standalone';

// io/email exports
export { Email, parseEmail } from './io/email';

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
