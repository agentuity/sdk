import { describe, expect, it } from 'bun:test';
import {
	dispatchRemoteSessionEvent,
	installRemoteRuntimeOperationGuards,
	REMOTE_RUNTIME_OPERATION_MESSAGE,
} from '../src/remote-runtime.ts';

describe('remote runtime helpers', () => {
	it('dispatches remote events through AgentSession._handleAgentEvent', () => {
		const seen: Array<Record<string, unknown>> = [];
		const session = {
			_handleAgentEvent(event: Record<string, unknown>) {
				seen.push(event);
			},
			agent: {
				emit() {
					throw new Error('dispatchRemoteSessionEvent should not use agent.emit()');
				},
			},
		};
		const event = { type: 'message_update', timestamp: 1234 };

		dispatchRemoteSessionEvent(session, event);

		expect(seen).toEqual([event]);
	});

	it('fails loudly if Pi changes the remote event dispatch hook', () => {
		expect(() => dispatchRemoteSessionEvent({}, { type: 'agent_start', timestamp: 1 })).toThrow(
			'_handleAgentEvent'
		);
	});

	it('blocks runtime session replacement operations in controller mode', async () => {
		const blocked: string[] = [];
		const runtime: Record<string, () => Promise<unknown>> = {};

		installRemoteRuntimeOperationGuards(runtime, (operation) => {
			blocked.push(`${REMOTE_RUNTIME_OPERATION_MESSAGE} (${operation})`);
		});

		await expect(runtime.newSession?.()).resolves.toEqual({ cancelled: true });
		await expect(runtime.switchSession?.()).resolves.toEqual({ cancelled: true });
		await expect(runtime.fork?.()).resolves.toEqual({ cancelled: true });
		await expect(runtime.importFromJsonl?.()).resolves.toEqual({ cancelled: true });
		expect(blocked).toEqual([
			`${REMOTE_RUNTIME_OPERATION_MESSAGE} (/new)`,
			`${REMOTE_RUNTIME_OPERATION_MESSAGE} (/resume)`,
			`${REMOTE_RUNTIME_OPERATION_MESSAGE} (/fork)`,
			`${REMOTE_RUNTIME_OPERATION_MESSAGE} (/import)`,
		]);
	});
});
