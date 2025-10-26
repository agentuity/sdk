import { AsyncLocalStorage } from 'node:async_hooks';
import type { Tracer } from '@opentelemetry/api';
import type { AgentContext, AgentName } from './agent';
import type { Logger } from './logger';
import WaitUntilHandler from './_waituntil';
import { registerServices } from './_services';

export interface RequestAgentContextArgs<TAgent> {
	sessionId: string;
	agent: TAgent;
	agentName: AgentName;
	logger: Logger;
	tracer: Tracer;
	setHeader: (k: string, v: string) => void;
}

export class RequestAgentContext<TAgent> implements AgentContext {
	agent: TAgent;
	agentName: AgentName;
	logger: Logger;
	sessionId: string;
	tracer: Tracer;
	private waituntilHandler: WaitUntilHandler;

	constructor(args: RequestAgentContextArgs<TAgent>) {
		this.agent = args.agent;
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

const asyncLocalStorage = new AsyncLocalStorage<AgentContext>({
	name: 'AgentContext',
});

export const getAgentContext = (): AgentContext => {
	const context = asyncLocalStorage.getStore();
	if (!context) {
		throw new Error('AgentContext is not available');
	}
	return context;
};

export const runInAgentContext = <TAgent>(
	ctxObject: Record<string, unknown>,
	args: RequestAgentContextArgs<TAgent>,
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
	return asyncLocalStorage.run(ctx, async () => {
		return next().then(() => {
			setImmediate(() => ctx.waitUntilAll()); // TODO: move until session
		});
	});
};
