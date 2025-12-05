import { AsyncLocalStorage } from 'node:async_hooks';
import type { Context as HonoContext } from 'hono';
import type { Tracer } from '@opentelemetry/api';
import {
	StructuredError,
	type KeyValueStorage,
	type StreamStorage,
	type VectorStorage,
} from '@agentuity/core';
import type { AgentContext, AgentRegistry, AgentRunner, AgentRuntimeState } from './agent';
import { AGENT_RUNTIME, CURRENT_AGENT } from './_config';
import type { Logger } from './logger';
import type WaitUntilHandler from './_waituntil';
import { registerServices } from './_services';
import type { Thread, Session } from './session';

export interface RequestAgentContextArgs<
	TAgentMap extends AgentRegistry = AgentRegistry,
	TConfig = unknown,
	TAppState = Record<string, never>,
> {
	sessionId: string;
	agent: TAgentMap;
	logger: Logger;
	tracer: Tracer;
	session: Session;
	thread: Thread;
	handler: WaitUntilHandler;
	config: TConfig;
	app: TAppState;
	runtime: AgentRuntimeState;
}

export class RequestAgentContext<
	TAgentMap extends AgentRegistry = AgentRegistry,
	TConfig = unknown,
	TAppState = Record<string, never>,
> implements AgentContext<TAgentMap, TConfig, TAppState>
{
	agent: TAgentMap;
	logger: Logger;
	sessionId: string;
	tracer: Tracer;
	kv!: KeyValueStorage;
	stream!: StreamStorage;
	vector!: VectorStorage;
	state: Map<string, unknown>;
	session: Session;
	thread: Thread;
	config: TConfig;
	app: TAppState;
	[AGENT_RUNTIME]: AgentRuntimeState;
	private handler: WaitUntilHandler;

	constructor(args: RequestAgentContextArgs<TAgentMap, TConfig, TAppState>) {
		this.agent = args.agent;
		this.logger = args.logger;
		this.sessionId = args.sessionId;
		this.tracer = args.tracer;
		this.thread = args.thread;
		this.session = args.session;
		this.config = args.config;
		this.app = args.app;
		this[AGENT_RUNTIME] = args.runtime;
		this.state = new Map<string, unknown>();
		this.handler = args.handler;
		registerServices(this, false); // agents already populated via args.agent
	}

	waitUntil(callback: Promise<void> | (() => void | Promise<void>)): void {
		this.handler.waitUntil(callback);
	}
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const agentAsyncLocalStorage = new AsyncLocalStorage<AgentContext<any, any, any>>();
const httpAsyncLocalStorage = new AsyncLocalStorage<HonoContext>();

export const inAgentContext = (): boolean => {
	const context = agentAsyncLocalStorage.getStore();
	return !!context;
};

export const inHTTPContext = (): boolean => {
	const context = httpAsyncLocalStorage.getStore();
	return !!context;
};

const AgentContextNotAvailableError = StructuredError(
	'AgentContextNotAvailableError',
	'AgentContext is not available'
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const getAgentContext = (): AgentContext<any, any, any> => {
	const context = agentAsyncLocalStorage.getStore();
	if (!context) {
		throw new AgentContextNotAvailableError();
	}
	return context;
};

const HTTPContextNotAvailableError = StructuredError(
	'HTTPContextNotAvailableError',
	'HTTPContext is not available'
);

export const getHTTPContext = (): HonoContext => {
	const context = httpAsyncLocalStorage.getStore();
	if (!context) {
		throw new HTTPContextNotAvailableError();
	}
	return context;
};

export const getAgentAsyncLocalStorage = () => agentAsyncLocalStorage;
export const getHTTPAsyncLocalStorage = () => httpAsyncLocalStorage;

/**
 * Get the current executing agent's metadata (for internal telemetry use only).
 * Returns undefined if not in an agent context or no agent is executing.
 * @internal
 */
export const getCurrentAgentMetadata = (): AgentRunner['metadata'] | undefined => {
	const context = agentAsyncLocalStorage.getStore();
	if (!context) return undefined;
	// Access internal symbol property
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return (context as any)[CURRENT_AGENT]?.metadata;
};

export const setupRequestAgentContext = <
	TAgentMap extends AgentRegistry = AgentRegistry,
	TConfig = unknown,
	TAppState = Record<string, never>,
>(
	ctxObject: Record<string, unknown>,
	args: RequestAgentContextArgs<TAgentMap, TConfig, TAppState>,
	next: () => Promise<void>
) => {
	const ctx = new RequestAgentContext<TAgentMap, TConfig, TAppState>(args);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const _ctx = ctx as any;
	Object.getOwnPropertyNames(ctx).forEach((k) => {
		ctxObject[k] = _ctx[k];
	});
	for (const k of ['waitUntil']) {
		ctxObject[k] = _ctx[k];
	}
	// Replace executionCtx.waitUntil with our WaitUntilHandler
	Object.defineProperty(ctxObject, 'executionCtx', {
		get() {
			return {
				waitUntil: (promise: Promise<unknown>) => {
					args.handler.waitUntil(promise as Promise<void>);
				},
				passThroughOnException: () => {},
				props: {},
			};
		},
		configurable: true,
	});
	return agentAsyncLocalStorage.run(ctx, async () => {
		const result = await next();
		return result;
	});
};

export const runInHTTPContext = async <HonoContext>(
	ctx: HonoContext,
	next: () => Promise<void>
) => {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return httpAsyncLocalStorage.run(ctx as any, next);
};
