import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { RemoteSession } from '../src/remote-session.ts';

const OriginalWebSocket = globalThis.WebSocket;
const ORIGINAL_AGENTUITY_ORGID = process.env.AGENTUITY_ORGID;
const ORIGINAL_AGENTUITY_CLOUD_ORG_ID = process.env.AGENTUITY_CLOUD_ORG_ID;

class MockWebSocket {
	static CONNECTING = 0;
	static OPEN = 1;
	static CLOSED = 3;
	static instances: MockWebSocket[] = [];

	readyState = MockWebSocket.CONNECTING;
	onopen: ((event: Event) => void) | null = null;
	onmessage: ((event: MessageEvent) => void) | null = null;
	onerror: ((event: Event) => void) | null = null;
	onclose: ((event: CloseEvent) => void) | null = null;
	readonly sent: string[] = [];
	readonly url: string;
	readonly options: unknown;

	constructor(url: string, options?: unknown) {
		this.url = url;
		this.options = options;
		MockWebSocket.instances.push(this);
	}

	send(data: string) {
		this.sent.push(data);
	}

	close() {
		this.readyState = MockWebSocket.CLOSED;
		this.onclose?.({
			code: 1000,
			reason: '',
			wasClean: true,
		} as CloseEvent);
	}

	open() {
		this.readyState = MockWebSocket.OPEN;
		this.onopen?.(new Event('open'));
	}

	receive(payload: unknown) {
		this.onmessage?.({
			data: JSON.stringify(payload),
		} as MessageEvent);
	}
}

describe('RemoteSession', () => {
	beforeEach(() => {
		MockWebSocket.instances = [];
		globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
		delete process.env.AGENTUITY_ORGID;
		delete process.env.AGENTUITY_CLOUD_ORG_ID;
	});

	afterEach(() => {
		globalThis.WebSocket = OriginalWebSocket;
		MockWebSocket.instances = [];
		if (ORIGINAL_AGENTUITY_ORGID === undefined) {
			delete process.env.AGENTUITY_ORGID;
		} else {
			process.env.AGENTUITY_ORGID = ORIGINAL_AGENTUITY_ORGID;
		}
		if (ORIGINAL_AGENTUITY_CLOUD_ORG_ID === undefined) {
			delete process.env.AGENTUITY_CLOUD_ORG_ID;
		} else {
			process.env.AGENTUITY_CLOUD_ORG_ID = ORIGINAL_AGENTUITY_CLOUD_ORG_ID;
		}
	});

	it('connects as a controller, sends bootstrap_ready, and hydrates into paused state when the lead is disconnected', async () => {
		const remote = new RemoteSession('sess_original');
		const seenEvents: string[] = [];
		remote.onEvent((event) => {
			seenEvents.push(event.type);
		});

		const connectPromise = remote.connect('ws://hub.example/api/ws');
		const socket = MockWebSocket.instances[0];
		expect(socket).toBeDefined();
		expect(socket?.url).toContain('role=controller');
		expect(socket?.url).toContain('sessionId=sess_original');

		socket!.open();
		socket!.receive({
			type: 'init',
			sessionId: 'sess_live',
			label: 'Remote Session',
		});

		await connectPromise;

		expect(remote.sessionId).toBe('sess_live');
		expect(remote.label).toBe('Remote Session');
		expect(socket!.sent).toContain(JSON.stringify({ type: 'bootstrap_ready' }));
		expect(remote.getLifecycleState()).toMatchObject({
			sessionId: 'sess_live',
			label: 'Remote Session',
			transport: 'connected',
			phase: 'hydrating',
		});

		socket!.receive({
			type: 'session_hydration',
			sessionId: 'sess_live',
			entries: [],
			tasks: [],
			leadConnected: false,
			streamingState: {
				isStreaming: false,
			},
		});

		expect(seenEvents).toContain('session_hydration');
		expect(remote.getLifecycleState()).toMatchObject({
			sessionId: 'sess_live',
			label: 'Remote Session',
			transport: 'connected',
			phase: 'paused',
			hydrationReceived: true,
			leadConnected: false,
			isStreaming: false,
		});
	});

	it('rejects the initial connect when the hub sends a protocol_error before init', async () => {
		const remote = new RemoteSession('sess_protocol_error');
		const connectPromise = remote.connect('ws://hub.example/api/ws');
		const socket = MockWebSocket.instances[0];
		expect(socket).toBeDefined();

		socket!.open();
		socket!.receive({
			type: 'protocol_error',
			message: 'bootstrap timeout',
		});

		await expect(connectPromise).rejects.toThrow('bootstrap timeout');
		expect(remote.getLifecycleState()).toMatchObject({
			sessionId: 'sess_protocol_error',
			lastError: 'bootstrap timeout',
		});
	});

	it('falls back to AGENTUITY_CLOUD_ORG_ID for controller auth when AGENTUITY_ORGID is unset', async () => {
		process.env.AGENTUITY_CLOUD_ORG_ID = 'org_cloud';

		const remote = new RemoteSession('sess_env_org');
		remote.apiKey = 'agc_test_key';

		const connectPromise = remote.connect('ws://hub.example/api/ws');
		const socket = MockWebSocket.instances[0];
		expect(socket).toBeDefined();
		expect(decodeURIComponent(socket!.url)).toContain('orgId=org_cloud');
		expect((socket!.options as { headers?: Record<string, string> }).headers).toEqual({
			'x-agentuity-auth-api-key': 'agc_test_key',
			'x-agentuity-orgid': 'org_cloud',
		});

		socket!.open();
		socket!.receive({
			type: 'init',
			sessionId: 'sess_env_org',
		});

		await connectPromise;
	});
});
