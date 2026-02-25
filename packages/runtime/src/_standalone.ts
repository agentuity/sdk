import { context, SpanKind, SpanStatusCode, type Context, trace } from '@opentelemetry/api';
import { enrichContextWithTraceState } from './otel/tracestate';
import type {
	KeyValueStorage,
	StreamStorage,
	VectorStorage,
	SandboxService,
	QueueService,
	ScheduleService,
	Logger,
} from '@agentuity/core';
import { formatMessage } from './logger/util';
import type {
	AgentContext,
	AgentRegistry,
	AgentRuntimeState,
	AgentMetadata,
	AgentRunner,
} from './agent';
import { AGENT_RUNTIME, AGENT_IDS, isInsideAgentRuntime } from './_config';
import type { Thread, Session } from './session';
import { generateId } from './session';
import WaitUntilHandler from './_waituntil';
import { registerServices, createServices } from './_services';
import { getAgentAsyncLocalStorage } from './_context';
import { getLogger, getTracer, setGlobalLogger, setGlobalTracer } from './_server';
import { getAppState } from './app';
import { getThreadProvider, getSessionProvider, getSessionEventProvider } from './_services';
import * as runtimeConfig from './_config';

/**
 * Flag to track if standalone initialization has already been performed.
 * Prevents duplicate initialization across multiple createAgentContext() calls.
 */
let standaloneInitialized = false;

/**
 * Create a minimal console-based logger for standalone mode.
 * This logger outputs to console without OpenTelemetry integration.
 */
function createStandaloneLogger(): Logger {
	const logLevel = (process.env.AGENTUITY_LOG_LEVEL || 'info') as
		| 'trace'
		| 'debug'
		| 'info'
		| 'warn'
		| 'error';
	const levels = ['trace', 'debug', 'info', 'warn', 'error'];
	const currentLevelIndex = levels.indexOf(logLevel);

	const shouldLog = (level: string) => levels.indexOf(level) >= currentLevelIndex;

	const logger: Logger = {
		trace: (message: unknown, ...args: unknown[]) => {
			if (shouldLog('trace'))
				console.debug('[TRACE]', formatMessage(false, undefined, message, args));
		},
		debug: (message: unknown, ...args: unknown[]) => {
			if (shouldLog('debug'))
				console.debug('[DEBUG]', formatMessage(false, undefined, message, args));
		},
		info: (message: unknown, ...args: unknown[]) => {
			if (shouldLog('info'))
				console.info('[INFO]', formatMessage(false, undefined, message, args));
		},
		warn: (message: unknown, ...args: unknown[]) => {
			if (shouldLog('warn'))
				console.warn('[WARN]', formatMessage(false, undefined, message, args));
		},
		error: (message: unknown, ...args: unknown[]) => {
			if (shouldLog('error'))
				console.error('[ERROR]', formatMessage(false, undefined, message, args));
		},
		fatal: (message: unknown, ...args: unknown[]): never => {
			console.error('[FATAL]', formatMessage(false, undefined, message, args));
			process.exit(1);
		},
		child: () => logger,
	};

	return logger;
}

/**
 * Initialize standalone runtime globals.
 * This sets up minimal logger, tracer, and services for standalone execution.
 * Called automatically by createAgentContext() when not running inside agent runtime.
 */
function initializeStandaloneRuntime(): void {
	if (standaloneInitialized) {
		return;
	}

	const logger = createStandaloneLogger();
	const tracer = trace.getTracer('standalone-agent');

	// Set global state
	setGlobalLogger(logger);
	setGlobalTracer(tracer);

	// Set minimal app state if not already set
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	if (!(globalThis as any).__AGENTUITY_APP_STATE__) {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(globalThis as any).__AGENTUITY_APP_STATE__ = {};
	}

	// Initialize services (will use local services since not authenticated)
	const serverUrl = `http://127.0.0.1:${process.env.PORT || '3500'}`;
	createServices(logger, undefined, serverUrl);

	standaloneInitialized = true;
	logger.debug('Standalone runtime initialized');
}

/**
 * Options for creating a standalone agent context.
 *
 * Use this when executing agents outside of HTTP requests (Discord bots, cron jobs, etc.)
 */
export interface StandaloneContextOptions {
	/**
	 * Session ID for this execution. If not provided, will be auto-generated from trace context.
	 */
	sessionId?: string;
	/**
	 * Thread for multi-turn conversations. If not provided, will be restored/created from thread provider.
	 */
	thread?: Thread;
	/**
	 * Session for this execution. If not provided, will be created.
	 */
	session?: Session;
	/**
	 * Parent OpenTelemetry context for distributed tracing.
	 */
	parentContext?: Context;
	/**
	 * Trigger type for this execution (used in telemetry and session events).
	 */
	trigger?: import('@agentuity/core').SessionStartEvent['trigger'];
}

/**
 * Options for invoke() method.
 */
export interface InvokeOptions {
	/**
	 * Span name for OpenTelemetry trace (default: 'agent-invocation')
	 */
	spanName?: string;
}

/**
 * Standalone agent context for executing agents outside of HTTP requests.
 *
 * This context provides the same infrastructure as HTTP request contexts:
 * - OpenTelemetry tracing with proper span hierarchy
 * - Session and thread management (save/restore)
 * - Background task handling (waitUntil)
 * - Session event tracking (start/complete)
 * - Access to all services (kv, stream, vector)
 *
 * @example
 * ```typescript
 * import { createAgentContext } from '@agentuity/runtime';
 * import myAgent from './agents/my-agent';
 *
 * // Simple usage:
 * const ctx = createAgentContext();
 * const result = await ctx.invoke(() => myAgent.run(input));
 *
 * // With custom session tracking:
 * const ctx = createAgentContext({
 *   sessionId: discordMessage.id,
 *   trigger: 'discord'
 * });
 * const result = await ctx.invoke(() => myAgent.run(input));
 *
 * // Reuse context for multiple agents:
 * const ctx = createAgentContext();
 * const result1 = await ctx.invoke(() => agent1.run(input1));
 * const result2 = await ctx.invoke(() => agent2.run(result1));
 * ```
 */
export class StandaloneAgentContext<
	TAgentMap extends AgentRegistry = AgentRegistry,
	TConfig = unknown,
	TAppState = Record<string, never>,
> implements AgentContext<TAgentMap, TConfig, TAppState>
{
	// Immutable context properties (safe for concurrent access)
	agent: TAgentMap = {} as TAgentMap;
	logger: Logger;
	tracer: import('@opentelemetry/api').Tracer;
	kv!: KeyValueStorage;
	stream!: StreamStorage;
	vector!: VectorStorage;
	sandbox!: SandboxService;
	queue!: QueueService;
	schedule!: ScheduleService;
	config: TConfig;
	app: TAppState;
	current!: AgentMetadata;
	[AGENT_RUNTIME]: AgentRuntimeState;

	// Note: The following are mutable and will be set per-invocation via AsyncLocalStorage
	// They exist on the interface for compatibility but are overwritten during invoke()
	sessionId: string;
	state: Map<string, unknown>;
	session: Session;
	thread: Thread;
	auth: import('@agentuity/auth/types').AuthInterface | null;
	[AGENT_IDS]?: Set<string>;

	// Immutable options stored from constructor
	private readonly parentContext: Context;
	private readonly trigger: import('@agentuity/core').SessionStartEvent['trigger'];
	private readonly initialSessionId?: string;

	constructor(options?: StandaloneContextOptions) {
		// Auto-initialize if not inside agent runtime and globals are not set
		let logger = getLogger();
		let tracer = getTracer();
		let app = getAppState();

		if (!logger || !tracer) {
			// Check if we're inside the agent runtime (dev server or cloud)
			if (isInsideAgentRuntime()) {
				// Inside runtime but globals not set - this is an error
				throw new Error(
					'Global state not initialized. This should not happen inside the agent runtime. ' +
						'Please report this issue.'
				);
			}

			// Not inside runtime - auto-initialize for standalone use
			initializeStandaloneRuntime();

			// Re-fetch globals after initialization
			logger = getLogger()!;
			tracer = getTracer()!;
			app = getAppState();
		}

		this.logger = logger;
		this.tracer = tracer;
		this.app = app as TAppState;
		this.config = {} as TConfig;
		this.state = new Map();
		this.parentContext = options?.parentContext ?? context.active();
		this.trigger = (options?.trigger as typeof this.trigger) ?? 'manual';
		this.initialSessionId = options?.sessionId;

		// Session ID will be set properly in invoke() after span is created
		this.sessionId = options?.sessionId ?? 'pending';

		// Thread and session will be restored in invoke()
		this.thread =
			options?.thread ??
			({
				id: 'pending',
				state: {
					loaded: false,
					dirty: false,
					get: async () => undefined,
					set: async () => {},
					has: async () => false,
					delete: async () => {},
					clear: async () => {},
					entries: async () => [],
					keys: async () => [],
					values: async () => [],
					size: async () => 0,
					push: async () => {},
				},
				getMetadata: async () => ({}),
				setMetadata: async () => {},
				addEventListener: () => {},
				removeEventListener: () => {},
				destroy: async () => {},
				empty: async () => true,
			} as Thread);

		this.session =
			options?.session ??
			({
				id: 'pending',
				thread: this.thread,
				state: new Map(),
				metadata: {},
				addEventListener: () => {},
				removeEventListener: () => {},
				serializeUserData: () => undefined,
			} as Session);

		this.auth = null;

		// Create isolated runtime state
		this[AGENT_RUNTIME] = {
			agents: new Map(),
			agentConfigs: new Map(),
			agentEventListeners: new WeakMap(),
		};

		// Register services (kv, stream, vector)
		registerServices(this, true); // true = populate agents registry
	}

	waitUntil(_callback: Promise<void> | (() => void | Promise<void>)): void {
		// This will be called from within invoke() where waitUntilHandler is in scope
		// We need to access the per-call waitUntilHandler from the current invocation
		// This is handled by updating the context during invoke() via AsyncLocalStorage
		throw new Error('waitUntil must be called from within invoke() execution context');
	}

	/**
	 * Execute a function within this agent context.
	 *
	 * This method:
	 * 1. Creates an OpenTelemetry span for the invocation
	 * 2. Restores/creates session and thread
	 * 3. Sends session start event
	 * 4. Executes the function within AsyncLocalStorage context
	 * 5. Waits for background tasks (waitUntil)
	 * 6. Saves session and thread
	 * 7. Sends session complete event
	 *
	 * @param fn - Function to execute (typically () => agent.run(input))
	 * @param options - Optional configuration for the invocation
	 * @returns Promise that resolves to the function's return value
	 *
	 * @example
	 * ```typescript
	 * const result = await ctx.invoke(() => myAgent.run({ userId: '123' }));
	 * ```
	 *
	 * @example
	 * ```typescript
	 * // Multiple agents in sequence:
	 * const result = await ctx.invoke(async () => {
	 *   const step1 = await agent1.run(input);
	 *   return agent2.run(step1);
	 * });
	 * ```
	 */
	async invoke<T>(fn: () => Promise<T>, options?: InvokeOptions): Promise<T> {
		const threadProvider = getThreadProvider();
		const sessionProvider = getSessionProvider();
		const sessionEventProvider = getSessionEventProvider();
		const storage = getAgentAsyncLocalStorage();

		// Create per-invocation state (prevents race conditions on concurrent calls)
		const waitUntilHandler = new WaitUntilHandler(this.tracer);
		const agentIds = new Set<string>();
		let invocationSessionId = this.initialSessionId ?? 'pending';
		let invocationThread: Thread;
		let invocationSession: Session;
		const invocationState = new Map<string, unknown>();

		// Create a per-call context that inherits from this but has isolated mutable state
		const callContext = Object.create(this) as StandaloneAgentContext<
			TAgentMap,
			TConfig,
			TAppState
		>;
		callContext.sessionId = invocationSessionId;
		callContext.state = invocationState;
		callContext[AGENT_IDS] = agentIds;
		callContext.waitUntil = (callback: Promise<void> | (() => void | Promise<void>)) => {
			waitUntilHandler.waitUntil(callback);
		};

		// Execute within parent context (for distributed tracing)
		return await context.with(this.parentContext, async () => {
			// Build enriched traceState BEFORE span creation so the
			// recording span inherits it and it gets exported to OTLP.
			const projectId = runtimeConfig.getProjectId();
			const orgId = runtimeConfig.getOrganizationId();
			const deploymentId = runtimeConfig.getDeploymentId();
			const isDevMode = runtimeConfig.isDevMode();

			const enrichedContext = enrichContextWithTraceState(context.active(), {
				pid: projectId,
				oid: orgId,
				did: deploymentId,
				d: isDevMode ? '1' : undefined,
			});

			// Create a span for this invocation (similar to otelMiddleware's HTTP span)
			return await trace.getTracer('standalone-agent').startActiveSpan(
				options?.spanName ?? 'agent-invocation',
				{
					kind: SpanKind.INTERNAL, // Not HTTP, but internal invocation
					attributes: {
						trigger: this.trigger,
					},
				},
				enrichedContext,
				async (span) => {
					const sctx = span.spanContext();

					// Generate sessionId from traceId if not provided
					invocationSessionId =
						this.initialSessionId ??
						(sctx?.traceId ? `sess_${sctx.traceId}` : generateId('sess'));
					callContext.sessionId = invocationSessionId;

					// Restore thread and session (like otelMiddleware does)
					// For standalone contexts, we create a simple thread/session if not provided
					// The threadProvider.restore expects a Hono context with cookie/header access
					// For standalone contexts without HTTP, we just create a new thread
					const { DefaultThread, generateId: genId } = await import('./session');
					const threadId = genId('thrd');
					// Create a no-op restore function for standalone contexts
					const restoreFn = async () => ({ state: new Map(), metadata: {} });
					invocationThread = new DefaultThread(threadProvider, threadId, restoreFn);
					callContext.thread = invocationThread;

					invocationSession = await sessionProvider.restore(
						invocationThread,
						invocationSessionId
					);
					callContext.session = invocationSession;

					// Send session start event (if configured)
					const shouldSendSession = !!(orgId && projectId);
					let canSendSessionEvents = true;

					if (shouldSendSession) {
						await sessionEventProvider
							.start({
								id: invocationSessionId,
								orgId,
								projectId,
								threadId: invocationThread.id,
								routeId: 'standalone', // No route for standalone contexts
								deploymentId,
								devmode: isDevMode,
								environment: runtimeConfig.getEnvironment(),
								method: 'STANDALONE',
								url: '',
								trigger: this.trigger,
								metadata:
									Object.keys(invocationSession.metadata).length > 0
										? invocationSession.metadata
										: undefined,
							})
							.catch((ex) => {
								canSendSessionEvents = false;
								this.logger.error('error sending session start event: %s', ex);
							});
					}

					let hasPendingWaits = false;

					try {
						// Execute function within AsyncLocalStorage context with per-call context
						const result = await storage.run(callContext, fn);

						// Wait for background tasks (like otelMiddleware does)
						if (waitUntilHandler.hasPending()) {
							hasPendingWaits = true;
							waitUntilHandler
								.waitUntilAll(this.logger, invocationSessionId)
								.then(async () => {
									this.logger.debug(
										'wait until finished for session %s',
										invocationSessionId
									);
									await sessionProvider.save(invocationSession);
									await threadProvider.save(invocationThread);
									span.setStatus({ code: SpanStatusCode.OK });
									if (shouldSendSession && canSendSessionEvents) {
										const userData = invocationSession.serializeUserData();
										sessionEventProvider
											.complete({
												id: invocationSessionId,
												threadId: (await invocationThread.empty())
													? null
													: invocationThread.id,
												statusCode: 200, // Success
												agentIds: Array.from(agentIds),
												userData,
												metadata:
													Object.keys(invocationSession.metadata).length > 0
														? invocationSession.metadata
														: undefined,
											})
											.then(() => {})
											.catch((ex) =>
												this.logger.error(
													'session complete failed: %s',
													ex instanceof Error ? ex.message : ex
												)
											);
									}
								})
								.catch(async (ex) => {
									this.logger.error(
										'wait until errored for session %s. %s',
										invocationSessionId,
										ex
									);
									if (ex instanceof Error) {
										span.recordException(ex);
									}
									const message = (ex as Error).message ?? String(ex);
									span.setStatus({
										code: SpanStatusCode.ERROR,
										message,
									});
									this.logger.error(message);
									if (shouldSendSession && canSendSessionEvents) {
										const userData = invocationSession.serializeUserData();
										sessionEventProvider
											.complete({
												id: invocationSessionId,
												threadId: (await invocationThread.empty())
													? null
													: invocationThread.id,
												statusCode: 500, // Error
												error: message,
												agentIds: Array.from(agentIds),
												userData,
												metadata:
													Object.keys(invocationSession.metadata).length > 0
														? invocationSession.metadata
														: undefined,
											})
											.then(() => {})
											.catch((ex) =>
												this.logger.error(
													'session complete failed: %s',
													ex instanceof Error ? ex.message : ex
												)
											);
									}
								})
								.finally(() => {
									span.end();
								});
						} else {
							span.setStatus({ code: SpanStatusCode.OK });
							if (shouldSendSession && canSendSessionEvents) {
								const userData = invocationSession.serializeUserData();
								sessionEventProvider
									.complete({
										id: invocationSessionId,
										threadId: (await invocationThread.empty())
											? null
											: invocationThread.id,
										statusCode: 200,
										agentIds: Array.from(agentIds),
										userData,
										metadata:
											Object.keys(invocationSession.metadata).length > 0
												? invocationSession.metadata
												: undefined,
									})
									.then(() => {})
									.catch((ex) =>
										this.logger.error(
											'session complete failed: %s',
											ex instanceof Error ? ex.message : ex
										)
									);
							}
						}

						return result;
					} catch (ex) {
						if (ex instanceof Error) {
							span.recordException(ex);
						}
						const message = (ex as Error).message ?? String(ex);
						span.setStatus({
							code: SpanStatusCode.ERROR,
							message,
						});
						this.logger.error(message);
						if (shouldSendSession && canSendSessionEvents) {
							const userData = invocationSession.serializeUserData();
							sessionEventProvider
								.complete({
									id: invocationSessionId,
									threadId: (await invocationThread.empty()) ? null : invocationThread.id,
									statusCode: 500,
									error: message,
									agentIds: Array.from(agentIds),
									userData,
									metadata:
										Object.keys(invocationSession.metadata).length > 0
											? invocationSession.metadata
											: undefined,
								})
								.then(() => {})
								.catch((ex) =>
									this.logger.error(
										'session complete failed: %s',
										ex instanceof Error ? ex.message : ex
									)
								);
						}
						throw ex;
					} finally {
						if (!hasPendingWaits) {
							try {
								await sessionProvider.save(invocationSession);
								await threadProvider.save(invocationThread);
							} finally {
								span.end();
							}
						}
					}
				}
			);
		});
	}

	/**
	 * Execute an agent with the given input within this context.
	 *
	 * This is a convenience method that wraps `invoke()` for cleaner syntax
	 * when running a single agent.
	 *
	 * @param agent - The agent to execute (must have a `run` method)
	 * @param input - Input to pass to the agent (if agent requires input)
	 * @returns Promise that resolves to the agent's output
	 *
	 * @example
	 * ```typescript
	 * import { createAgentContext } from '@agentuity/runtime';
	 * import myAgent from './agents/my-agent';
	 *
	 * const ctx = createAgentContext();
	 * const result = await ctx.run(myAgent, { name: 'World' });
	 * ```
	 *
	 * @example
	 * ```typescript
	 * // Agent without input
	 * const result = await ctx.run(statusAgent);
	 * ```
	 *
	 * @example
	 * ```typescript
	 * // Multiple agents in sequence
	 * const ctx = createAgentContext();
	 * const step1 = await ctx.run(preprocessAgent, rawData);
	 * const step2 = await ctx.run(processAgent, step1);
	 * const result = await ctx.run(postprocessAgent, step2);
	 * ```
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	async run<TOutput>(agent: AgentRunner<any, any, any>, input?: unknown): Promise<TOutput> {
		// Handle both agents with and without input
		// The agent.run type varies based on whether input schema is defined
		const runFn = agent.run as (input?: unknown) => Promise<TOutput>;
		return this.invoke(() => runFn(input));
	}
}

/**
 * Create a standalone agent context for executing agents outside of HTTP requests.
 *
 * This is useful for Discord bots, cron jobs, CLI scripts, sandboxes, or any scenario
 * where you need to run agents but don't have an HTTP request context.
 *
 * **Auto-initialization**: When running outside of the Agentuity runtime (dev server or cloud),
 * this function automatically initializes minimal runtime globals. No manual setup required.
 *
 * @param options - Optional configuration for the context
 * @returns A StandaloneAgentContext instance
 *
 * @example
 * ```typescript
 * import { createAgentContext } from '@agentuity/runtime';
 * import myAgent from './agents/my-agent';
 *
 * // Simple usage with ctx.run() (recommended):
 * const ctx = createAgentContext();
 * const result = await ctx.run(myAgent, { name: 'World' });
 *
 * // Discord bot example:
 * client.on('messageCreate', async (message) => {
 *   const ctx = createAgentContext({
 *     sessionId: message.id,
 *     trigger: 'discord'
 *   });
 *   const response = await ctx.run(chatAgent, { message: message.content });
 *   await message.reply(response.text);
 * });
 *
 * // Cron job example:
 * cron.schedule('0 * * * *', async () => {
 *   const ctx = createAgentContext({ trigger: 'cron' });
 *   await ctx.run(cleanupAgent);
 * });
 *
 * // Multiple agents in sequence:
 * const ctx = createAgentContext();
 * const step1 = await ctx.run(preprocessAgent, rawData);
 * const result = await ctx.run(processAgent, step1);
 * ```
 */
export function createAgentContext<TAppState = Record<string, never>>(
	options?: StandaloneContextOptions
): StandaloneAgentContext<AgentRegistry, unknown, TAppState> {
	return new StandaloneAgentContext<AgentRegistry, unknown, TAppState>(options);
}
