import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { parseClientMessage } from '../src/services/coder/protocol.ts';
import {
	CoderHubWebSocketClient,
	CoderHubWebSocketError,
	type CoderHubWebSocketErrorInstance,
} from '../src/services/coder/websocket.ts';

const OriginalWebSocket = globalThis.WebSocket;

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

	constructor(url: string) {
		this.url = url;
		MockWebSocket.instances.push(this);
	}

	send(data: string) {
		this.sent.push(data);
	}

	close(code = 1000, reason = '') {
		this.readyState = MockWebSocket.CLOSED;
		this.onclose?.({
			code,
			reason,
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

async function flushAsyncWork() {
	await Promise.resolve();
	await Promise.resolve();
}

describe('CoderHubWebSocketClient', () => {
	beforeEach(() => {
		MockWebSocket.instances = [];
		globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
	});

	afterEach(() => {
		globalThis.WebSocket = OriginalWebSocket;
		MockWebSocket.instances = [];
	});

	it('treats observer hydration as the ready signal and preserves the first server message', async () => {
		const seenMessages: Array<Record<string, unknown>> = [];
		let openCount = 0;

		const client = new CoderHubWebSocketClient({
			apiKey: 'ag_test',
			orgId: 'org_test',
			url: 'ws://hub.example/api/ws',
			role: 'observer',
			sessionId: 'codesess_obs',
			subscribe: ['streaming', 'content'],
			autoReconnect: false,
			onOpen: () => {
				openCount += 1;
			},
			onMessage: (message) => {
				seenMessages.push(message as unknown as Record<string, unknown>);
			},
		});

		client.connect();
		await flushAsyncWork();

		const socket = MockWebSocket.instances[0];
		expect(socket).toBeDefined();
		expect(decodeURIComponent(socket!.url)).toContain('role=observer');
		expect(decodeURIComponent(socket!.url)).toContain('sessionId=codesess_obs');
		expect(decodeURIComponent(socket!.url)).toContain('subscribe=streaming,content');
		expect(decodeURIComponent(socket!.url)).toContain('api_key=ag_test');

		socket!.open();
		socket!.receive({
			type: 'session_hydration',
			sessionId: 'codesess_obs',
			resumedAt: Date.now(),
			entries: [],
			tasks: [],
			stream: { output: 'hello', thinking: '', tasks: {} },
			leadConnected: true,
			streamingState: { isStreaming: true },
		});

		expect(client.state).toBe('connected');
		expect(openCount).toBe(1);
		expect(seenMessages).toHaveLength(1);
		expect(seenMessages[0]).toMatchObject({
			type: 'session_hydration',
			sessionId: 'codesess_obs',
		});
	});

	it('sends bootstrap_ready before flushing queued controller messages', async () => {
		const initMessages: Array<Record<string, unknown>> = [];
		const client = new CoderHubWebSocketClient({
			url: 'ws://hub.example/api/ws',
			role: 'controller',
			sessionId: 'codesess_ctrl',
			autoReconnect: false,
			onInit: (message) => {
				initMessages.push(message as unknown as Record<string, unknown>);
			},
		});

		client.send({
			type: 'ping',
			timestamp: 123,
		});
		client.connect();
		await flushAsyncWork();

		const socket = MockWebSocket.instances[0];
		expect(socket).toBeDefined();
		socket!.open();
		socket!.receive({
			type: 'init',
			role: 'controller',
			sessionId: 'codesess_ctrl',
		});

		expect(client.state).toBe('connected');
		expect(initMessages).toHaveLength(1);
		const typedMessages = socket!.sent
			.map((payload) => JSON.parse(payload) as Record<string, unknown>)
			.filter((payload) => typeof payload.type === 'string');
		expect(typedMessages).toEqual([
			{ type: 'bootstrap_ready' },
			{ type: 'ping', timestamp: 123 },
		]);
	});

	it('preserves server rejection details for pre-ready protocol failures', async () => {
		const seenErrors: CoderHubWebSocketErrorInstance[] = [];
		const client = new CoderHubWebSocketClient({
			url: 'ws://hub.example/api/ws',
			role: 'observer',
			sessionId: 'codesess_rejected',
			autoReconnect: false,
			onError: (error) => {
				if (error instanceof CoderHubWebSocketError) {
					seenErrors.push(error);
				}
			},
		});

		client.connect();
		await flushAsyncWork();

		const socket = MockWebSocket.instances[0];
		expect(socket).toBeDefined();
		socket!.open();
		socket!.receive({
			type: 'connection_rejected',
			code: 'observer_forbidden',
			message: 'You do not have access to session: codesess_rejected',
		});

		expect(seenErrors).toHaveLength(1);
		expect(seenErrors[0]).toMatchObject({
			code: 'auth_failed',
			serverCode: 'observer_forbidden',
			serverMessageType: 'connection_rejected',
			serverMessage: 'You do not have access to session: codesess_rejected',
		});
	});

	it('surfaces terminal close details when the socket closes before ready', async () => {
		const seenErrors: CoderHubWebSocketErrorInstance[] = [];
		const client = new CoderHubWebSocketClient({
			url: 'ws://hub.example/api/ws',
			role: 'observer',
			sessionId: 'codesess_missing',
			autoReconnect: false,
			onError: (error) => {
				if (error instanceof CoderHubWebSocketError) {
					seenErrors.push(error);
				}
			},
		});

		client.connect();
		await flushAsyncWork();

		const socket = MockWebSocket.instances[0];
		expect(socket).toBeDefined();
		socket!.open();
		socket!.close(4404, 'Session not found');

		expect(seenErrors).toHaveLength(1);
		expect(seenErrors[0]).toMatchObject({
			code: 'connection_error',
			closeCode: 4404,
			closeReason: 'Session not found',
		});
	});

	it('does not misreport terminal closes after ready as handshake failures', async () => {
		const seenErrors: CoderHubWebSocketErrorInstance[] = [];
		const client = new CoderHubWebSocketClient({
			url: 'ws://hub.example/api/ws',
			role: 'observer',
			sessionId: 'codesess_live',
			autoReconnect: false,
			onError: (error) => {
				if (error instanceof CoderHubWebSocketError) {
					seenErrors.push(error);
				}
			},
		});

		client.connect();
		await flushAsyncWork();

		const socket = MockWebSocket.instances[0];
		expect(socket).toBeDefined();
		socket!.open();
		socket!.receive({
			type: 'session_hydration',
			sessionId: 'codesess_live',
			resumedAt: Date.now(),
			entries: [],
			tasks: [],
			stream: { output: '', thinking: '', tasks: {} },
			leadConnected: true,
			streamingState: { isStreaming: false },
		});

		expect(client.state).toBe('connected');

		socket!.close(4404, 'Session not found');

		expect(seenErrors).toHaveLength(0);
	});
});

describe('Coder Hub protocol', () => {
	it('accepts typed observer subscribe messages', () => {
		expect(
			parseClientMessage({
				type: 'subscribe',
				patterns: ['streaming', 'content'],
			})
		).toEqual({
			type: 'subscribe',
			patterns: ['streaming', 'content'],
		});
	});
});
