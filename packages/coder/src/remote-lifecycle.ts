export type RemoteLifecyclePhase =
	| 'connecting'
	| 'hydrating'
	| 'replaying'
	| 'live'
	| 'paused'
	| 'resuming'
	| 'reconnecting'
	| 'disconnected';

export type RemoteTransportState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

export interface RemoteLifecycleState {
	sessionId: string;
	label: string;
	transport: RemoteTransportState;
	phase: RemoteLifecyclePhase;
	leadConnected: boolean | null;
	isStreaming: boolean;
	hydrationReceived: boolean;
	streamId: string | null;
	streamUrl: string | null;
	lastError: string | null;
}

export type RemoteLifecycleEvent =
	| { type: 'connect_start'; reconnect: boolean }
	| { type: 'init'; sessionId?: string; label?: string }
	| {
			type: 'hydration';
			leadConnected?: boolean;
			isStreaming?: boolean;
	  }
	| { type: 'replay_event' }
	| { type: 'replay_idle' }
	| { type: 'live_signal'; isStreaming?: boolean }
	| { type: 'session_resume'; streamId?: string | null; streamUrl?: string | null }
	| { type: 'stream_ready'; streamId?: string | null; streamUrl?: string | null }
	| { type: 'rpc_command_error'; error: string; paused: boolean }
	| { type: 'local_resume_requested' }
	| { type: 'connection_change'; state: 'reconnecting' | 'disconnected' };

export function createRemoteLifecycleState(sessionId: string): RemoteLifecycleState {
	return {
		sessionId,
		label: '',
		transport: 'disconnected',
		phase: 'disconnected',
		leadConnected: null,
		isStreaming: false,
		hydrationReceived: false,
		streamId: null,
		streamUrl: null,
		lastError: null,
	};
}

function patchState(
	state: RemoteLifecycleState,
	patch: Partial<RemoteLifecycleState>
): RemoteLifecycleState {
	let changed = false;
	const next = { ...state };

	for (const [key, value] of Object.entries(patch)) {
		const typedKey = key as keyof RemoteLifecycleState;
		if (next[typedKey] !== value) {
			changed = true;
			(next[typedKey] as RemoteLifecycleState[keyof RemoteLifecycleState]) =
				value as RemoteLifecycleState[keyof RemoteLifecycleState];
		}
	}

	return changed ? next : state;
}

function resolveConnectedPhase(input: {
	leadConnected: boolean | null;
	isStreaming: boolean;
}): RemoteLifecyclePhase {
	if (input.isStreaming) return 'live';
	if (input.leadConnected === false) return 'paused';
	return 'live';
}

export function applyRemoteLifecycleEvent(
	state: RemoteLifecycleState,
	event: RemoteLifecycleEvent
): RemoteLifecycleState {
	switch (event.type) {
		case 'connect_start':
			return patchState(state, {
				transport: event.reconnect ? 'reconnecting' : 'connecting',
				phase: event.reconnect ? 'reconnecting' : 'connecting',
				lastError: null,
			});

		case 'init':
			return patchState(state, {
				sessionId: event.sessionId || state.sessionId,
				label: event.label || state.label,
				transport: 'connected',
				phase: 'hydrating',
				lastError: null,
			});

		case 'hydration': {
			const leadConnected =
				typeof event.leadConnected === 'boolean' ? event.leadConnected : state.leadConnected;
			const isStreaming =
				typeof event.isStreaming === 'boolean' ? event.isStreaming : state.isStreaming;
			return patchState(state, {
				leadConnected,
				isStreaming,
				hydrationReceived: true,
				transport: 'connected',
				phase: resolveConnectedPhase({ leadConnected, isStreaming }),
				lastError: null,
			});
		}

		case 'replay_event':
			if (state.transport !== 'connected') return state;
			return patchState(state, {
				phase: 'replaying',
			});

		case 'replay_idle':
			if (state.phase !== 'replaying') return state;
			return patchState(state, {
				phase: resolveConnectedPhase({
					leadConnected: state.leadConnected,
					isStreaming: state.isStreaming,
				}),
			});

		case 'live_signal':
			return patchState(state, {
				transport: 'connected',
				phase: 'live',
				leadConnected: true,
				isStreaming:
					typeof event.isStreaming === 'boolean' ? event.isStreaming : state.isStreaming,
				lastError: null,
			});

		case 'session_resume':
			return patchState(state, {
				streamId: event.streamId ?? state.streamId,
				streamUrl: event.streamUrl ?? state.streamUrl,
				phase: 'resuming',
				lastError: null,
			});

		case 'stream_ready':
			return patchState(state, {
				streamId: event.streamId ?? state.streamId,
				streamUrl: event.streamUrl ?? state.streamUrl,
			});

		case 'rpc_command_error':
			return patchState(state, {
				lastError: event.error,
				leadConnected: event.paused ? false : state.leadConnected,
				isStreaming: event.paused ? false : state.isStreaming,
				phase: event.paused ? 'paused' : state.phase,
			});

		case 'local_resume_requested':
			return patchState(state, {
				phase: 'resuming',
				lastError: null,
			});

		case 'connection_change':
			return patchState(state, {
				transport: event.state,
				phase: event.state,
				isStreaming: false,
			});
	}
}

export function getRemoteLifecycleLabel(state: RemoteLifecycleState): string {
	switch (state.phase) {
		case 'connecting':
			return 'Connecting';
		case 'hydrating':
			return 'Hydrating';
		case 'replaying':
			return 'Replaying';
		case 'paused':
			return 'Paused';
		case 'resuming':
			return 'Resuming';
		case 'reconnecting':
			return 'Reconnecting';
		case 'disconnected':
			return 'Disconnected';
		case 'live':
			return 'Live';
	}
}

export function getRemoteLifecycleActivityLabel(state: RemoteLifecycleState): string | undefined {
	switch (state.phase) {
		case 'connecting':
			return 'connecting to sandbox...';
		case 'hydrating':
			return 'hydrating remote session...';
		case 'replaying':
			return 'replaying remote history...';
		case 'paused':
			return 'sandbox paused';
		case 'resuming':
			return 'resuming sandbox...';
		case 'reconnecting':
			return 'reconnecting...';
		case 'disconnected':
			return state.lastError ? `disconnected: ${state.lastError}` : 'disconnected';
		case 'live':
			return undefined;
	}
}

export function getRemoteLifecycleWorkingMessage(state: RemoteLifecycleState): string | undefined {
	switch (state.phase) {
		case 'connecting':
			return 'Connecting to remote sandbox...';
		case 'hydrating':
			return 'Hydrating remote session...';
		case 'replaying':
			return 'Replaying remote history...';
		case 'resuming':
			return 'Resuming remote sandbox...';
		case 'reconnecting':
			return 'Connection lost - reconnecting...';
		case 'paused':
		case 'disconnected':
		case 'live':
			return undefined;
	}
}
