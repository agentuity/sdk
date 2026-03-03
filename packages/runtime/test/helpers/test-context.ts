/**
 * TestAgentContext - A simple AgentContext implementation for unit testing.
 * Does not require AsyncLocalStorage or any server infrastructure.
 */

import type { AgentContext, AgentRegistry, AgentRunner, AgentRuntimeState } from '../../src/agent';
import { AGENT_RUNTIME } from '../../src/_config';
import type { Logger } from '../../src/logger';
import type { Thread, Session } from '../../src/session';
import { trace, type Tracer } from '@opentelemetry/api';
import {
	createMockKeyValueStorage,
	createMockStreamStorage,
	createMockVectorStorage,
} from './mock-services';

/**
 * Options for configuring TestAgentContext.
 *
 * @template TConfig - Agent-specific config type from setup function
 * @template TAppState - Application state type from createApp
 */
export interface TestContextOptions<TConfig = unknown, TAppState = Record<string, never>> {
	/** Agent-specific config (passed to ctx.config) */
	config?: TConfig;
	/** Application state (passed to ctx.app) */
	app?: TAppState;
	/** Custom logger (defaults to silent logger) */
	logger?: Logger;
	/** Session ID (defaults to 'test-session') */
	sessionId?: string;
	/** Agent name (defaults to 'test-agent') */
	agentName?: string;
}

/**
 * Simple logger that doesn't output anything
 */
function createSilentLogger(): Logger {
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
		child: () => createSilentLogger(),
	};
}

/**
 * AgentContext implementation for unit testing agents.
 *
 * Provides isolated runtime state with in-memory mock implementations of all services:
 * - KeyValueStorage (in-memory Map)
 * - StreamStorage (in-memory streams)
 * - VectorStorage (in-memory vectors)
 * - Silent logger (no console output)
 * - OpenTelemetry tracer
 * - Background task tracking (waitUntil)
 *
 * Each TestAgentContext instance has isolated runtime state, so tests don't interfere
 * with each other. Use with runInAgentContext() to execute agents.
 *
 * @template TConfig - Agent-specific config type from setup function
 * @template TAppState - Application state type from createApp
 *
 * @example
 * ```typescript
 * import { runInAgentContext, TestAgentContext } from '@agentuity/runtime/test';
 * import { expect, test } from 'bun:test';
 *
 * test('greeting agent', async () => {
 *   const ctx = new TestAgentContext();
 *   const result = await runInAgentContext(ctx, greetingAgent, {
 *     name: 'Alice',
 *     age: 30
 *   });
 *   expect(result).toBe('Hello, Alice! You are 30 years old.');
 * });
 *
 * test('agent with config', async () => {
 *   const ctx = new TestAgentContext({
 *     config: { maxRetries: 3 },
 *     app: { db: mockDatabase }
 *   });
 *   const result = await runInAgentContext(ctx, myAgent);
 *   expect(result).toBeDefined();
 * });
 *
 * test('background tasks', async () => {
 *   const ctx = new TestAgentContext();
 *   await runInAgentContext(ctx, myAgent);
 *   await ctx.waitForBackgroundTasks(); // Wait for all waitUntil promises
 * });
 * ```
 */
export class TestAgentContext<TConfig = unknown, TAppState = Record<string, never>>
	implements
		AgentContext<
			AgentRegistry,
			AgentRunner | undefined,
			AgentRunner | undefined,
			TConfig,
			TAppState
		>
{
	sessionId: string;
	agentName: string;
	logger: Logger;
	tracer: Tracer;
	kv: ReturnType<typeof createMockKeyValueStorage>;
	stream: ReturnType<typeof createMockStreamStorage>;
	vector: ReturnType<typeof createMockVectorStorage>;
	state: Map<string, unknown>;
	thread: Thread;
	session: Session;
	app: TAppState;
	config: TConfig;
	[AGENT_RUNTIME]: AgentRuntimeState;

	private waitUntilPromises: Promise<void>[] = [];

	constructor(options?: TestContextOptions<TConfig, TAppState>) {
		this.sessionId = options?.sessionId ?? 'test-session';
		this.agentName = options?.agentName ?? 'test-agent';
		this.logger = options?.logger ?? createSilentLogger();
		this.tracer = trace.getTracer('test-tracer');
		this.kv = createMockKeyValueStorage();
		this.stream = createMockStreamStorage();
		this.vector = createMockVectorStorage();
		this.state = new Map();
		this.thread = {
			id: 'test-thread',
			state: new Map(),
			addEventListener: () => {},
			removeEventListener: () => {},
			destroy: async () => {},
			empty: () => this.thread.state.size === 0,
		};
		this.session = {
			id: 'test-session',
			thread: this.thread,
			state: new Map(),
			addEventListener: () => {},
			removeEventListener: () => {},
			serializeUserData: () => undefined,
		};
		this.app = (options?.app ?? {}) as TAppState;
		this.config = (options?.config ?? {}) as TConfig;

		// Create isolated runtime state for this test
		this[AGENT_RUNTIME] = {
			agents: new Map(),
			agentConfigs: new Map(),
			agentEventListeners: new WeakMap(),
		};
	}

	waitUntil(promise: Promise<void> | (() => void | Promise<void>)): void {
		if (typeof promise === 'function') {
			const result = promise();
			if (result instanceof Promise) {
				this.waitUntilPromises.push(result);
			}
		} else {
			this.waitUntilPromises.push(promise);
		}
	}

	/**
	 * Wait for all background tasks scheduled with ctx.waitUntil() to complete.
	 *
	 * Useful in tests to verify that async background work has completed before
	 * making assertions. All promises passed to ctx.waitUntil() are tracked and
	 * waited for.
	 *
	 * @example
	 * ```typescript
	 * test('background task tracking', async () => {
	 *   const ctx = new TestAgentContext();
	 *   let taskCompleted = false;
	 *
	 *   const agent = createAgent('test', {
	 *     handler: async (ctx) => {
	 *       ctx.waitUntil(async () => {
	 *         await new Promise(r => setTimeout(r, 100));
	 *         taskCompleted = true;
	 *       });
	 *       return 'done';
	 *     }
	 *   });
	 *
	 *   await runInAgentContext(ctx, agent);
	 *   expect(taskCompleted).toBe(false); // Not yet!
	 *
	 *   await ctx.waitForBackgroundTasks();
	 *   expect(taskCompleted).toBe(true); // Now it's done
	 * });
	 * ```
	 */
	async waitForBackgroundTasks(): Promise<void> {
		await Promise.all(this.waitUntilPromises);
	}

	/**
	 * Register an agent in this test context's runtime.
	 *
	 * This is required if you want event listeners and evaluations to work in tests.
	 * Normally you don't need to call this manually - runInAgentContext() handles it.
	 *
	 * @param agent - The internal Agent object (not AgentRunner)
	 * @internal
	 */
	registerAgent(agent: { metadata?: { name?: string }; evals?: unknown }): void {
		const name = agent.metadata?.name;
		if (name && agent.evals) {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			this[AGENT_RUNTIME].agents.set(name, agent as any);

			// Copy event listeners if they exist
			// eslint-disable-next-line @typescript-eslint/no-require-imports
			const { agentEventListeners } = require('../../src/agent');
			const listeners = agentEventListeners?.get(agent);
			if (listeners) {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				this[AGENT_RUNTIME].agentEventListeners.set(agent as any, listeners);
			}
		}
	}
}
