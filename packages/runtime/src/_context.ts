import { AsyncLocalStorage } from 'node:async_hooks';
import type { Tracer } from '@opentelemetry/api';
import type { KeyValueStorage, ObjectStorage, StreamStorage, VectorStorage } from '@agentuity/core';
import type { AgentContext, AgentName } from './agent';
import type { Logger } from './logger';
import WaitUntilHandler from './_waituntil';
import { registerServices } from './_services';

export interface RequestAgentContextArgs<TAgentMap, TAgent> {
	sessionId: string;
	agent: TAgentMap;
	current: TAgent;
	parent?: TAgent;
	agentName: AgentName;
	logger: Logger;
	tracer: Tracer;
	setHeader: (k: string, v: string) => void;
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
	private waituntilHandler: WaitUntilHandler;

	constructor(args: RequestAgentContextArgs<TAgentMap, TAgent>) {
		this.agent = args.agent;
		this.current = args.current;
		this.parent = args.parent;
		this.agentName = args.agentName;
		this.logger = args.logger;
		this.sessionId = args.sessionId;
		this.tracer = args.tracer;
		this.waituntilHandler = new WaitUntilHandler(args.setHeader, args.tracer);
		registerServices(this);
	}

	waitUntil(callback: Promise<void> | (() => void | Promise<void>)): void {
		this.waituntilHandler.waitUntil(callback);
	}

	waitUntilAll(): Promise<void> {
		return this.waituntilHandler.waitUntilAll(this.logger, this.sessionId);
	}
}

const asyncLocalStorage = new AsyncLocalStorage<AgentContext>();

export const inAgentContext = (): boolean => {
	const context = asyncLocalStorage.getStore();
	return !!context;
};

export const getAgentContext = (): AgentContext => {
	const context = asyncLocalStorage.getStore();
	if (!context) {
		throw new Error('AgentContext is not available');
	}
	return context;
};

export const getAsyncLocalStorage = () => asyncLocalStorage;

export const runInAgentContext = <TAgentMap, TAgent>(
	ctxObject: Record<string, unknown>,
	args: RequestAgentContextArgs<TAgentMap, TAgent>,
	next: () => Promise<void>,
	isWebSocket: boolean = false
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
	return asyncLocalStorage.run(ctx, async () => {
		const result = await next();
		// Don't call waitUntilAll for websocket upgrades - they stay open
		if (!isWebSocket) {
			setImmediate(() => ctx.waitUntilAll()); // TODO: move until session
		}
		return result;
	});
};
