import { context, SpanKind, SpanStatusCode, type Context, trace } from '@opentelemetry/api';
import { TraceState } from '@opentelemetry/core';
import type {
	KeyValueStorage,
	StreamStorage,
	VectorStorage,
} from '@agentuity/core';
import type { AgentContext, AgentRegistry, AgentRuntimeState } from './agent';
import { AGENT_RUNTIME, AGENT_IDS } from './_config';
import type { Logger } from './logger';
import type { Thread, Session } from './session';
import { generateId } from './session';
import WaitUntilHandler from './_waituntil';
import { registerServices } from './_services';
import { getAgentAsyncLocalStorage } from './_context';
import {
	getLogger,
	getTracer,
	getAppState,
} from './_server';
import {
	getThreadProvider,
	getSessionProvider,
	getSessionEventProvider,
} from './_services';
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
	agent: TAgentMap = {} as TAgentMap;
	logger: Logger;
	sessionId: string;
	tracer: import('@opentelemetry/api').Tracer;
	kv!: KeyValueStorage;
	stream!: StreamStorage;
	vector!: VectorStorage;
	state: Map<string, unknown>;
	session: Session;
	thread: Thread;
	config: TConfig;
	app: TAppState;
	[AGENT_RUNTIME]: AgentRuntimeState;
	[AGENT_IDS]?: Set<string>;
	
	private waitUntilHandler: WaitUntilHandler;
	private parentContext: Context;
	private trigger: import('@agentuity/core').SessionStartEvent['trigger'];
	private initialSessionId?: string;
	private currentAgentIds: Set<string> = new Set();

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
		this.thread = options?.thread ?? ({
			id: 'pending',
			state: new Map(),
			addEventListener: () => {},
			removeEventListener: () => {},
			destroy: async () => {},
			empty: () => true,
		} as Thread);
		
		this.session = options?.session ?? ({
			id: 'pending',
			thread: this.thread,
			state: new Map(),
			addEventListener: () => {},
			removeEventListener: () => {},
			serializeUserData: () => undefined,
		} as Session);

		this.waitUntilHandler = new WaitUntilHandler(tracer);

		// Create isolated runtime state
		this[AGENT_RUNTIME] = {
			agents: new Map(),
			agentConfigs: new Map(),
			agentEventListeners: new WeakMap(),
		};

		// Register services (kv, stream, vector)
		registerServices(this, true); // true = populate agents registry
	}

	waitUntil(callback: Promise<void> | (() => void | Promise<void>)): void {
		this.waitUntilHandler.waitUntil(callback);
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
		
		// Create a new WaitUntilHandler for each invoke (they can only be used once)
		this.waitUntilHandler = new WaitUntilHandler(this.tracer);
		
		// Reset agentIds for this invocation
		this.currentAgentIds = new Set();
		
		// Store agentIds on the context so agent execution can access it
		this[AGENT_IDS] = this.currentAgentIds;

		// Execute within parent context (for distributed tracing)
		return await context.with(this.parentContext, async () => {
			// Create a span for this invocation (similar to otelMiddleware's HTTP span)
			return await trace.getTracer('standalone-agent').startActiveSpan(
				options?.spanName ?? 'agent-invocation',
				{
					kind: SpanKind.INTERNAL, // Not HTTP, but internal invocation
					attributes: {
						'trigger': this.trigger,
					},
				},
				async (span) => {
					const sctx = span.spanContext();
					
					// Generate sessionId from traceId if not provided
					const sessionId = this.initialSessionId ?? (sctx?.traceId ? `sess_${sctx.traceId}` : generateId('sess'));
					this.sessionId = sessionId;

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
							traceState
						})
					);

					// Restore thread and session (like otelMiddleware does)
					// For standalone contexts, we create a simple thread/session if not provided
					// The threadProvider.restore expects a Hono context with cookie/header access
					// For standalone contexts without HTTP, we just create a new thread
					if (!this.thread || this.thread.id === 'pending') {
						const { DefaultThread, generateId } = await import('./session');
						const threadId = generateId('thrd');
						this.thread = new DefaultThread(threadProvider, threadId);
					}
					
					this.session = await sessionProvider.restore(this.thread, sessionId);

					// Track agent IDs for session events (use the instance set)
					const agentIds = this.currentAgentIds;

					// Send session start event (if configured)
					const shouldSendSession = !!(orgId && projectId);
					let canSendSessionEvents = true;

					if (shouldSendSession) {
						await sessionEventProvider
							.start({
								id: sessionId,
								orgId,
								projectId,
								threadId: this.thread.id,
								routeId: 'standalone', // No route for standalone contexts
								deploymentId,
								devmode: isDevMode,
								environment: runtimeConfig.getEnvironment(),
								method: 'STANDALONE',
								url: '',
								trigger: this.trigger,
							})
							.catch((ex) => {
								canSendSessionEvents = false;
								this.logger.error('error sending session start event: %s', ex);
							});
					}

					let hasPendingWaits = false;

					try {
						// Execute function within AsyncLocalStorage context
						const result = await storage.run(this, fn);

						// Wait for background tasks (like otelMiddleware does)
						if (this.waitUntilHandler.hasPending()) {
							hasPendingWaits = true;
							this.waitUntilHandler
								.waitUntilAll(this.logger, sessionId)
								.then(async () => {
									this.logger.debug('wait until finished for session %s', sessionId);
									await sessionProvider.save(this.session);
									await threadProvider.save(this.thread);
									span.setStatus({ code: SpanStatusCode.OK });
									if (shouldSendSession && canSendSessionEvents) {
										const userData = this.session.serializeUserData();
										sessionEventProvider
											.complete({
												id: sessionId,
												threadId: this.thread.empty() ? null : this.thread.id,
												statusCode: 200, // Success
												agentIds: Array.from(agentIds),
												userData,
											})
											.then(() => {})
											.catch((ex) => this.logger.error(ex));
									}
								})
								.catch((ex) => {
									this.logger.error('wait until errored for session %s. %s', sessionId, ex);
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
										const userData = this.session.serializeUserData();
										sessionEventProvider
											.complete({
												id: sessionId,
												threadId: this.thread.empty() ? null : this.thread.id,
												statusCode: 500, // Error
												error: message,
												agentIds: Array.from(agentIds),
												userData,
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
								const userData = this.session.serializeUserData();
								sessionEventProvider
									.complete({
										id: sessionId,
										threadId: this.thread.empty() ? null : this.thread.id,
										statusCode: 200,
										agentIds: Array.from(agentIds),
										userData,
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
							const userData = this.session.serializeUserData();
							sessionEventProvider
								.complete({
									id: sessionId,
									threadId: this.thread.empty() ? null : this.thread.id,
									statusCode: 500,
									error: message,
									agentIds: Array.from(agentIds),
									userData,
								})
								.then(() => {})
								.catch((ex) => this.logger.error(ex));
						}
						throw ex;
					} finally {
						if (!hasPendingWaits) {
							try {
								await sessionProvider.save(this.session);
								await threadProvider.save(this.thread);
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
