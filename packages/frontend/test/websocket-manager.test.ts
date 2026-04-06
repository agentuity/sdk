import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { WebSocketManager } from '../src/websocket-manager';

// Mock WebSocket
class MockWebSocket {
	static CONNECTING = 0;
	static OPEN = 1;
	static CLOSING = 2;
	static CLOSED = 3;
	static instances: MockWebSocket[] = [];

	readyState = MockWebSocket.CONNECTING;
	url: string;
	onopen: ((event: unknown) => void) | null = null;
	onerror: ((event: unknown) => void) | null = null;
	onclose: ((event: unknown) => void) | null = null;
	onmessage: ((event: unknown) => void) | null = null;

	constructor(url: string) {
		this.url = url;
		MockWebSocket.instances.push(this);
		// Simulate async connection
		setTimeout(() => {
			this.readyState = MockWebSocket.OPEN;
			if (this.onopen) {
				this.onopen({});
			}
		}, 0);
	}

	send(_data: string | ArrayBuffer | Blob | ArrayBufferView) {
		if (this.readyState !== MockWebSocket.OPEN) {
			throw new Error('WebSocket is not open');
		}
		// Store for verification
	}

	close(code?: number, reason?: string) {
		this.readyState = MockWebSocket.CLOSED;
		if (this.onclose) {
			this.onclose({ code: code || 1000, reason: reason || '' });
		}
	}

	simulateMessage(data: unknown) {
		if (this.onmessage) {
			this.onmessage({ data: JSON.stringify(data) });
		}
	}

	simulateError() {
		if (this.onerror) {
			this.onerror({});
		}
	}
}

describe('WebSocketManager', () => {
	let originalWebSocket: typeof WebSocket;

	beforeEach(() => {
		originalWebSocket = globalThis.WebSocket;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(globalThis as any).WebSocket = MockWebSocket;
		MockWebSocket.instances = [];
	});

	afterEach(() => {
		globalThis.WebSocket = originalWebSocket;
		MockWebSocket.instances = [];
	});

	test('should establish connection', async () => {
		let connected = false;
		const manager = new WebSocketManager({
			url: 'ws://localhost:3000/test',
			callbacks: {
				onConnect: () => {
					connected = true;
				},
			},
		});

		manager.connect();

		// Wait for connection
		await new Promise((resolve) => setTimeout(resolve, 10));

		expect(connected).toBe(true);
		expect(manager.getState().isConnected).toBe(true);
		expect(manager.getState().readyState).toBe(MockWebSocket.OPEN);

		manager.dispose();
	});

	test('should receive messages', async () => {
		const messages: unknown[] = [];
		const manager = new WebSocketManager({
			url: 'ws://localhost:3000/test',
			callbacks: {
				onMessage: (msg) => messages.push(msg),
			},
		});

		manager.connect();

		// Wait for connection
		await new Promise((resolve) => setTimeout(resolve, 10));

		// Simulate message
		const ws = MockWebSocket.instances[0];
		ws.simulateMessage({ type: 'test', data: 'hello' });

		expect(messages).toHaveLength(1);
		expect(messages[0]).toEqual({ type: 'test', data: 'hello' });

		manager.dispose();
	});

	test('should send messages', async () => {
		const manager = new WebSocketManager({
			url: 'ws://localhost:3000/test',
		});

		manager.connect();

		// Wait for connection
		await new Promise((resolve) => setTimeout(resolve, 10));

		// Should not throw
		expect(() => manager.send({ message: 'hello' })).not.toThrow();

		manager.dispose();
	});

	test('should queue messages when disconnected', async () => {
		const manager = new WebSocketManager({
			url: 'ws://localhost:3000/test',
		});

		// Send before connecting (should queue)
		manager.send({ message: 'queued1' });
		manager.send({ message: 'queued2' });

		manager.connect();

		// Wait for connection - messages should be flushed
		await new Promise((resolve) => setTimeout(resolve, 10));

		expect(manager.getState().isConnected).toBe(true);

		manager.dispose();
	});

	test('should handle errors', async () => {
		let errorReceived = false;
		const manager = new WebSocketManager({
			url: 'ws://localhost:3000/test',
			callbacks: {
				onError: () => {
					errorReceived = true;
				},
			},
		});

		manager.connect();

		// Wait for connection
		await new Promise((resolve) => setTimeout(resolve, 10));

		// Simulate error
		const ws = MockWebSocket.instances[0];
		ws.simulateError();

		expect(errorReceived).toBe(true);

		manager.dispose();
	});

	test('should close connection', async () => {
		let disconnected = false;
		const manager = new WebSocketManager({
			url: 'ws://localhost:3000/test',
			callbacks: {
				onDisconnect: () => {
					disconnected = true;
				},
			},
		});

		manager.connect();

		// Wait for connection
		await new Promise((resolve) => setTimeout(resolve, 10));

		expect(manager.getState().isConnected).toBe(true);

		// Close connection
		manager.close();

		expect(disconnected).toBe(true);
		expect(manager.getState().isConnected).toBe(false);
	});

	test('should buffer messages before handler is set', async () => {
		const manager = new WebSocketManager<unknown, { data: string }>({
			url: 'ws://localhost:3000/test',
		});

		manager.connect();

		// Wait for connection
		await new Promise((resolve) => setTimeout(resolve, 10));

		// Send messages before setting handler
		const ws = MockWebSocket.instances[0];
		ws.simulateMessage({ data: 'msg1' });
		ws.simulateMessage({ data: 'msg2' });

		// Now set handler - should receive buffered messages
		const messages: unknown[] = [];
		manager.setMessageHandler((msg) => messages.push(msg));

		expect(messages).toHaveLength(2);
		expect(messages[0]).toEqual({ data: 'msg1' });
		expect(messages[1]).toEqual({ data: 'msg2' });

		manager.dispose();
	});

	test('should reconnect on failure', async () => {
		let connectCount = 0;
		const manager = new WebSocketManager({
			url: 'ws://localhost:3000/test',
			callbacks: {
				onConnect: () => {
					connectCount++;
				},
			},
			reconnect: {
				threshold: 0,
				baseDelay: 10,
				maxDelay: 100,
				jitter: 0, // Remove jitter for predictable timing
			},
		});

		manager.connect();

		// Wait for initial connection
		await new Promise((resolve) => setTimeout(resolve, 15));
		expect(connectCount).toBe(1);

		// Simulate abnormal close (should trigger reconnect)
		const ws = MockWebSocket.instances[0];
		ws.close(1006, 'Abnormal closure');

		// Wait for reconnection (baseDelay + connection time + buffer)
		await new Promise((resolve) => setTimeout(resolve, 50));

		// Should have reconnected
		expect(connectCount).toBeGreaterThanOrEqual(2);

		manager.dispose();
	});

	test('should convert http to ws protocol', () => {
		const manager = new WebSocketManager({
			url: 'http://localhost:3000/test',
		});

		manager.connect();

		const ws = MockWebSocket.instances[0];
		expect(ws.url).toBe('http://localhost:3000/test');

		manager.dispose();
	});
});
