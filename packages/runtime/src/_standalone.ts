import { context, SpanKind, SpanStatusCode, type Context, trace } from '@opentelemetry/api';
import { TraceState } from '@opentelemetry/core';
import type {
	KeyValueStorage,
	StreamStorage,
	VectorStorage,
	SandboxService,
} from '@agentuity/core';
import type { AgentContext, AgentRegistry, AgentRuntimeState } from './agent';
import { AGENT_RUNTIME, AGENT_IDS } from './_config';
import type { Logger } from './logger';
import type { Thread, Session } from './session';
import { generateId } from './session';
import WaitUntilHandler from './_waituntil';
import { registerServices } from './_services';
import { getAgentAsyncLocalStorage } from './_context';
import { getLogger, getTracer } from './_server';
import { getAppState } from './app';
import { getThreadProvider, getSessionProvider, getSessionEventProvider } from './_services';
import * as runtimeConfig from './_config';

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
	config: TConfig;
	app: TAppState;
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
		const logger = getLogger();
		const tracer = getTracer();
		const app = getAppState();

		if (!logger || !tracer || !app) {
			throw new Error(
				'Global state not initialized. Make sure createServer() has been called before createAgentContext().'
			);
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
				state: new Map(),
				metadata: {},
				addEventListener: () => {},
				removeEventListener: () => {},
				destroy: async () => {},
				empty: () => true,
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
			// Create a span for this invocation (similar to otelMiddleware's HTTP span)
			return await trace.getTracer('standalone-agent').startActiveSpan(
				options?.spanName ?? 'agent-invocation',
				{
					kind: SpanKind.INTERNAL, // Not HTTP, but internal invocation
					attributes: {
						trigger: this.trigger,
					},
				},
				async (span) => {
					const sctx = span.spanContext();

					// Generate sessionId from traceId if not provided
					invocationSessionId =
						this.initialSessionId ??
						(sctx?.traceId ? `sess_${sctx.traceId}` : generateId('sess'));
					callContext.sessionId = invocationSessionId;

					// Add to tracestate (like otelMiddleware does)
					// Note: SpanContext.traceState is readonly, so we update it by setting the span with a new context
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

					// Update the active context with the new trace state
					// We do this by setting the span in the context with updated trace state
					// Note: This creates a new context but we don't need to use it directly
					// as the span already has the trace state we need for propagation
					trace.setSpan(
						context.active(),
						trace.wrapSpanContext({
							...sctx,
							traceState,
						})
					);

					// Restore thread and session (like otelMiddleware does)
					// For standalone contexts, we create a simple thread/session if not provided
					// The threadProvider.restore expects a Hono context with cookie/header access
					// For standalone contexts without HTTP, we just create a new thread
					const { DefaultThread, generateId: genId } = await import('./session');
					const threadId = genId('thrd');
					invocationThread = new DefaultThread(threadProvider, threadId);
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
												threadId: invocationThread.empty() ? null : invocationThread.id,
												statusCode: 200, // Success
												agentIds: Array.from(agentIds),
												userData,
												metadata:
													Object.keys(invocationSession.metadata).length > 0
														? invocationSession.metadata
														: undefined,
											})
											.then(() => {})
											.catch((ex) => this.logger.error(ex));
									}
								})
								.catch((ex) => {
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
												threadId: invocationThread.empty() ? null : invocationThread.id,
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
											.catch((ex) => this.logger.error(ex));
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
										threadId: invocationThread.empty() ? null : invocationThread.id,
										statusCode: 200,
										agentIds: Array.from(agentIds),
										userData,
										metadata:
											Object.keys(invocationSession.metadata).length > 0
												? invocationSession.metadata
												: undefined,
									})
									.then(() => {})
									.catch((ex) => this.logger.error(ex));
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
									threadId: invocationThread.empty() ? null : invocationThread.id,
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
								.catch((ex) => this.logger.error(ex));
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
}

/**
 * Create a standalone agent context for executing agents outside of HTTP requests.
 *
 * This is useful for Discord bots, cron jobs, WebSocket callbacks, or any scenario
 * where you need to run agents but don't have an HTTP request context.
 *
 * @param options - Optional configuration for the context
 * @returns A StandaloneAgentContext instance
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
 * // Discord bot example:
 * client.on('messageCreate', async (message) => {
 *   const ctx = createAgentContext({
 *     sessionId: message.id,
 *     trigger: 'discord'
 *   });
 *   const response = await ctx.invoke(() =>
 *     chatAgent.run({ message: message.content })
 *   );
 *   await message.reply(response.text);
 * });
 *
 * // Cron job example:
 * cron.schedule('0 * * * *', async () => {
 *   const ctx = createAgentContext({ trigger: 'cron' });
 *   await ctx.invoke(() => cleanupAgent.run());
 * });
 * ```
 */
export function createAgentContext<TAppState = Record<string, never>>(
	options?: StandaloneContextOptions
): StandaloneAgentContext<AgentRegistry, unknown, TAppState> {
	return new StandaloneAgentContext<AgentRegistry, unknown, TAppState>(options);
}
