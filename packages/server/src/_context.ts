import { AsyncLocalStorage } from 'node:async_hooks';
import type { AgentContext, AgentName } from './agent';
import { endPendingWaitUntil, startPendingWaitUntil } from './_idle';
import type { Logger } from './logger';

interface RequestAgentContextArgs<TAgent> {
	agent: TAgent;
	agentName: AgentName;
	logger: Logger;
}

export class RequestAgentContext<TAgent> implements AgentContext {
	agent: TAgent;
	agentName: AgentName;
	logger: Logger;

	constructor(args: RequestAgentContextArgs<TAgent>) {
		this.agent = args.agent;
		this.agentName = args.agentName;
		this.logger = args.logger;
	}

	async waitUntil(callback: () => void | Promise<void>): Promise<void> {
		// TODO: otel
		setImmediate(() => {
			startPendingWaitUntil();
			try {
				const p = callback();
				if (p && p instanceof Promise) {
					startPendingWaitUntil(); // since the finally will end one
					p.finally(endPendingWaitUntil);
				}
			} finally {
				endPendingWaitUntil();
			}
		});
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
	return asyncLocalStorage.run(ctx, next);
};
