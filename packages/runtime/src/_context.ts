import { AsyncLocalStorage } from 'node:async_hooks';
import type { Context as HonoContext } from 'hono';
import type { Tracer } from '@opentelemetry/api';
import type { KeyValueStorage, ObjectStorage, StreamStorage, VectorStorage } from '@agentuity/core';
import type { AgentContext, AgentName } from './agent';
import type { Logger } from './logger';
import type WaitUntilHandler from './_waituntil';
import { registerServices } from './_services';
import type { Thread, Session } from './session';

export interface RequestAgentContextArgs<TAgentMap, TAgent> {
	sessionId: string;
	agent: TAgentMap;
	current: TAgent;
	parent?: TAgent;
	agentName: AgentName;
	logger: Logger;
	tracer: Tracer;
	session: Session;
	thread: Thread;
	handler: WaitUntilHandler;
}

export class RequestAgentContext<TAgentMap, TAgent> implements AgentContext {
	agent: TAgentMap;
	current: TAgent;
	parent?: TAgent;
	agentName: AgentName;
	logger: Logger;
	sessionId: string;
	tracer: Tracer;
	kv!: KeyValueStorage;
	objectstore!: ObjectStorage;
	stream!: StreamStorage;
	vector!: VectorStorage;
	state: Map<string, unknown>;
	session: Session;
	thread: Thread;
	private handler: WaitUntilHandler;

	constructor(args: RequestAgentContextArgs<TAgentMap, TAgent>) {
		this.agent = args.agent;
		this.current = args.current;
		this.parent = args.parent;
		this.agentName = args.agentName;
		this.logger = args.logger;
		this.sessionId = args.sessionId;
		this.tracer = args.tracer;
		this.thread = args.thread;
		this.session = args.session;
		this.state = new Map<string, unknown>();
		this.handler = args.handler;
		registerServices(this, false); // agents already populated via args.agent
	}

	waitUntil(callback: Promise<void> | (() => void | Promise<void>)): void {
		this.handler.waitUntil(callback);
	}
}

const agentAsyncLocalStorage = new AsyncLocalStorage<AgentContext>();
const httpAsyncLocalStorage = new AsyncLocalStorage<HonoContext>();

export const inAgentContext = (): boolean => {
	const context = agentAsyncLocalStorage.getStore();
	return !!context;
};

export const inHTTPContext = (): boolean => {
	const context = httpAsyncLocalStorage.getStore();
	return !!context;
};

export const getAgentContext = (): AgentContext => {
	const context = agentAsyncLocalStorage.getStore();
	if (!context) {
		throw new Error('AgentContext is not available');
	}
	return context;
};

export const getHTTPContext = (): HonoContext => {
	const context = httpAsyncLocalStorage.getStore();
	if (!context) {
		throw new Error('HTTPContext is not available');
	}
	return context;
};

export const getAgentAsyncLocalStorage = () => agentAsyncLocalStorage;
export const getHTTPAsyncLocalStorage = () => httpAsyncLocalStorage;

export const runInAgentContext = <TAgentMap, TAgent>(
	ctxObject: Record<string, unknown>,
	args: RequestAgentContextArgs<TAgentMap, TAgent>,
	next: () => Promise<void>
) => {
	const ctx = new RequestAgentContext(args);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const _ctx = ctx as any;
	Object.getOwnPropertyNames(ctx).forEach((k) => {
		ctxObject[k] = _ctx[k];
	});
	for (const k of ['waitUntil']) {
		ctxObject[k] = _ctx[k];
	}
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
