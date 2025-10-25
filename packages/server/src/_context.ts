import { AsyncLocalStorage } from 'node:async_hooks';
import type { AgentContext } from './agent';
import { endPendingWaitUntil, startPendingWaitUntil } from './_idle';

export class RequestAgentContext implements AgentContext {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	agent: any;

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	constructor(agent: any) {
		this.agent = agent;
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

export const getContext = (): AgentContext => {
	const context = asyncLocalStorage.getStore();
	if (!context) {
		throw new Error('AgentContext is not available');
	}
	return context;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const runInAgentContext = (agent: any, next: () => Promise<void>) => {
	const ctx = new RequestAgentContext(agent);
	return asyncLocalStorage.run(ctx, next);
};
