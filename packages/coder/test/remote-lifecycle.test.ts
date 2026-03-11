import { describe, expect, it } from 'bun:test';
import {
	applyRemoteLifecycleEvent,
	createRemoteLifecycleState,
	getRemoteLifecycleActivityLabel,
	getRemoteLifecycleLabel,
	getRemoteLifecycleWorkingMessage,
} from '../src/remote-lifecycle.ts';

describe('remote lifecycle state', () => {
	it('tracks paused attach, local resume, and return to live', () => {
		let state = createRemoteLifecycleState('sess_123');
		state = applyRemoteLifecycleEvent(state, { type: 'connect_start', reconnect: false });
		state = applyRemoteLifecycleEvent(state, { type: 'init', sessionId: 'sess_123' });
		state = applyRemoteLifecycleEvent(state, {
			type: 'hydration',
			leadConnected: false,
			isStreaming: false,
		});

		expect(state.phase).toBe('paused');
		expect(getRemoteLifecycleLabel(state)).toBe('Paused');
		expect(getRemoteLifecycleActivityLabel(state)).toBe('sandbox paused');

		state = applyRemoteLifecycleEvent(state, { type: 'local_resume_requested' });
		expect(state.phase).toBe('resuming');
		expect(getRemoteLifecycleWorkingMessage(state)).toBe('Resuming remote sandbox...');

		state = applyRemoteLifecycleEvent(state, { type: 'live_signal', isStreaming: true });
		expect(state.phase).toBe('live');
		expect(state.leadConnected).toBe(true);
		expect(state.isStreaming).toBe(true);
	});

	it('treats replay as a temporary catch-up state and settles back to live', () => {
		let state = createRemoteLifecycleState('sess_live');
		state = applyRemoteLifecycleEvent(state, { type: 'init', sessionId: 'sess_live' });
		state = applyRemoteLifecycleEvent(state, {
			type: 'hydration',
			leadConnected: true,
			isStreaming: false,
		});
		state = applyRemoteLifecycleEvent(state, { type: 'replay_event' });

		expect(state.phase).toBe('replaying');
		expect(getRemoteLifecycleLabel(state)).toBe('Replaying');

		state = applyRemoteLifecycleEvent(state, { type: 'replay_idle' });
		expect(state.phase).toBe('live');
	});

	it('settles replay back to paused when the sandbox is not connected', () => {
		let state = createRemoteLifecycleState('sess_paused');
		state = applyRemoteLifecycleEvent(state, { type: 'init', sessionId: 'sess_paused' });
		state = applyRemoteLifecycleEvent(state, {
			type: 'hydration',
			leadConnected: false,
			isStreaming: false,
		});
		state = applyRemoteLifecycleEvent(state, { type: 'replay_event' });
		state = applyRemoteLifecycleEvent(state, { type: 'replay_idle' });

		expect(state.phase).toBe('paused');
	});

	it('stores stream metadata from resume and stream-ready messages', () => {
		let state = createRemoteLifecycleState('sess_stream');
		state = applyRemoteLifecycleEvent(state, {
			type: 'session_resume',
			streamId: 'stream_resume',
			streamUrl: 'https://example.com/resume',
		});
		state = applyRemoteLifecycleEvent(state, {
			type: 'stream_ready',
			streamId: 'stream_live',
			streamUrl: 'https://example.com/live',
		});

		expect(state.phase).toBe('resuming');
		expect(state.streamId).toBe('stream_live');
		expect(state.streamUrl).toBe('https://example.com/live');
	});

	it('moves back to paused when command forwarding fails because the sandbox is gone', () => {
		let state = createRemoteLifecycleState('sess_error');
		state = applyRemoteLifecycleEvent(state, { type: 'init', sessionId: 'sess_error' });
		state = applyRemoteLifecycleEvent(state, {
			type: 'hydration',
			leadConnected: true,
			isStreaming: true,
		});
		state = applyRemoteLifecycleEvent(state, {
			type: 'rpc_command_error',
			error: 'Sandbox is not connected. The session may need to be resumed.',
			paused: true,
		});

		expect(state.phase).toBe('paused');
		expect(state.leadConnected).toBe(false);
		expect(state.isStreaming).toBe(false);
		expect(state.lastError).toContain('Sandbox is not connected');
	});
});
