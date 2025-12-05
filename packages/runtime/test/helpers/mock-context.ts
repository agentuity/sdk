/**
 * Mock AgentContext factory for unit testing agents.
 * Provides a fully functional context without requiring a real server.
 */

import type { AgentContext, AgentRegistry, AgentRuntimeState } from '../../src/agent';
import type { Logger } from '../../src/logger';
import type { Thread, Session } from '../../src/session';
import { trace, type Tracer } from '@opentelemetry/api';
import {
	createMockKeyValueStorage,
	createMockStreamStorage,
	createMockVectorStorage,
} from './mock-services';
import { AGENT_RUNTIME } from '../../src/_config';

export interface CreateMockContextOptions<TConfig = unknown, TAppState = Record<string, never>> {
	/**
	 * Agent-specific config (from setup function)
	 */
	config?: TConfig;

	/**
	 * App-level state (from createApp setup)
	 */
	app?: TAppState;

	/**
	 * Mock logger (defaults to silent logger)
	 */
	logger?: Logger;

	/**
	 * Session ID (defaults to 'mock-session')
	 */
	sessionId?: string;

	/**
	 * Agent name (defaults to 'mock-agent')
	 */
	agentName?: string;
}

/**
 * Create a mock logger that doesn't output anything
 */
function createMockLogger(): Logger {
	const noop = () => {};
	return {
		trace: noop,
		debug: noop,
		info: noop,
		warn: noop,
		error: noop,
		fatal: ((msg: string) => {
			throw new Error(msg);
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		}) as any,
		child: () => createMockLogger(),
	};
}

/**
 * Create a mock tracer
 */
function createMockTracer(): Tracer {
	return trace.getTracer('mock-tracer');
}

/**
 * Create a mock thread
 */
function createMockThread(): Thread {
	const thread: Thread = {
		id: 'mock-thread',
		state: new Map(),
		addEventListener: () => {},
		removeEventListener: () => {},
		destroy: async () => {},
		empty: () => thread.state.size === 0,
	};
	return thread;
}

/**
 * Create a mock session
 */
function createMockSession(): Session {
	return {
		id: 'mock-session',
		thread: createMockThread(),
		state: new Map(),
		addEventListener: () => {},
		removeEventListener: () => {},
		serializeUserData: () => undefined,
	};
}

/**
 * Create a mock AgentContext for testing.
 *
 * This provides all the services and context an agent needs,
 * but uses in-memory implementations that don't require external services.
 *
 * @example
 * ```typescript
 * const ctx = createMockContext();
 * await ctx.kv.set('test-store', 'key', 'value');
 * const result = await myAgent.run({ input: 'test' });
 * ```
 */
export function createMockContext<TConfig = unknown, TAppState = Record<string, never>>(
	options?: CreateMockContextOptions<TConfig, TAppState>
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
): AgentContext<AgentRegistry, any, any, TConfig, TAppState> {
	const waitUntilPromises: Promise<void>[] = [];

	// Create a mock runtime state
	const runtime: AgentRuntimeState = {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		agents: new Map<string, any>(),
		agentConfigs: new Map<string, unknown>(),
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		agentEventListeners: new WeakMap<any, any>(),
	};

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const context: AgentContext<AgentRegistry, any, any, TConfig, TAppState> = {
		// Core identification
		sessionId: options?.sessionId ?? 'mock-session',
		agentName: options?.agentName ?? 'mock-agent',

		// Logging & tracing
		logger: options?.logger ?? createMockLogger(),
		tracer: createMockTracer(),

		// Storage services (in-memory mocks)
		kv: createMockKeyValueStorage(),
		stream: createMockStreamStorage(),
		vector: createMockVectorStorage(),

		// State
		state: new Map<string, unknown>(),

		// Session & Thread
		thread: createMockThread(),
		session: createMockSession(),

		// App & Config
		app: (options?.app ?? {}) as TAppState,
		config: (options?.config ?? {}) as TConfig,

		// WaitUntil handler
		waitUntil: (promise: Promise<void> | (() => void | Promise<void>)) => {
			if (typeof promise === 'function') {
				const result = promise();
				if (result instanceof Promise) {
					waitUntilPromises.push(result);
				}
			} else {
				waitUntilPromises.push(promise);
			}
		},

		// Runtime symbol
		[AGENT_RUNTIME]: runtime,
	};

	// Add helper to wait for all background tasks (useful in tests)
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(context as any).__waitForBackgroundTasks = async () => {
		await Promise.all(waitUntilPromises);
	};

	return context;
}

/**
 * Type-safe helper to access the waitForBackgroundTasks method
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function waitForBackgroundTasks(ctx: AgentContext<any, any, any, any, any>) {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const anyCtx = ctx as any;
	if (anyCtx.__waitForBackgroundTasks) {
		await anyCtx.__waitForBackgroundTasks();
	}
}

/**
 * Run an agent with a mock context.
 * This sets up the AsyncLocalStorage context so agent.run() works.
 *
 * @example
 * ```typescript
 * const result = await runAgentWithContext(myAgent, createMockContext());
 * ```
 */
export async function runAgentWithContext<TInput, TOutput>(
	agent: { run: (input?: TInput) => Promise<TOutput> },
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	ctx: AgentContext<any, any, any, any, any>,
	input?: TInput
): Promise<TOutput> {
	const { getAgentAsyncLocalStorage } = await import('../../src/_context');
	const storage = getAgentAsyncLocalStorage();

	return storage.run(ctx, async () => {
		if (input !== undefined) {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			return await (agent.run as any)(input);
		} else {
			return await agent.run();
		}
	});
}
