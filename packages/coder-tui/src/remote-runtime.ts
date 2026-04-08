import type { RpcEvent } from './remote-session.ts';

export const REMOTE_RUNTIME_OPERATION_MESSAGE =
	'Remote controller mode only supports the current sandbox session.';

type RemoteRuntimeOperation = '/new' | '/resume' | '/fork' | '/import';

interface RemoteRuntimeGuards {
	newSession?: () => Promise<unknown>;
	switchSession?: () => Promise<unknown>;
	fork?: () => Promise<unknown>;
	importFromJsonl?: () => Promise<unknown>;
}

interface RemoteSessionEventTarget {
	_handleAgentEvent?: (event: RpcEvent) => void;
}

export function dispatchRemoteSessionEvent(
	session: RemoteSessionEventTarget,
	event: RpcEvent
): void {
	if (typeof session._handleAgentEvent !== 'function') {
		throw new Error(
			'Pi AgentSession no longer exposes _handleAgentEvent; remote TUI event dispatch needs an update.'
		);
	}

	session._handleAgentEvent(event);
}

export function installRemoteRuntimeOperationGuards(
	runtime: RemoteRuntimeGuards,
	onBlocked: (operation: RemoteRuntimeOperation) => void
): void {
	const block = (operation: RemoteRuntimeOperation) => async (): Promise<{ cancelled: true }> => {
		onBlocked(operation);
		return { cancelled: true };
	};

	runtime.newSession = block('/new');
	runtime.switchSession = block('/resume');
	runtime.fork = block('/fork');
	runtime.importFromJsonl = block('/import');
}
