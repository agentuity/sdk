import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { EventStreamManager } from '../src/eventstream-manager';

// Mock EventSource
class MockEventSource {
	static CONNECTING = 0;
	static OPEN = 1;
	static CLOSED = 2;
	static instances: MockEventSource[] = [];

	readyState = MockEventSource.CONNECTING;
	url: string;
	onopen: ((event: unknown) => void) | null = null;
	onerror: ((event: unknown) => void) | null = null;
	onmessage: ((event: unknown) => void) | null = null;

	constructor(url: string) {
		this.url = url;
		MockEventSource.instances.push(this);
		// Simulate async connection
		setTimeout(() => {
			this.readyState = MockEventSource.OPEN;
			if (this.onopen) {
				this.onopen({});
			}
		}, 0);
	}

	close() {
		this.readyState = MockEventSource.CLOSED;
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

describe('EventStreamManager', () => {
	let originalEventSource: typeof EventSource;

	beforeEach(() => {
		originalEventSource = globalThis.EventSource;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(globalThis as any).EventSource = MockEventSource;
		MockEventSource.instances = [];
	});

	afterEach(() => {
		globalThis.EventSource = originalEventSource;
		MockEventSource.instances = [];
	});

	test('should establish connection', async () => {
		let connected = false;
		const manager = new EventStreamManager({
			url: 'http://localhost:3000/events',
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
		expect(manager.getState().readyState).toBe(MockEventSource.OPEN);

		manager.dispose();
	});

	test('should receive messages', async () => {
		const messages: unknown[] = [];
		const manager = new EventStreamManager({
			url: 'http://localhost:3000/events',
			callbacks: {
				onMessage: (msg) => messages.push(msg),
			},
		});

		manager.connect();

		// Wait for connection
		await new Promise((resolve) => setTimeout(resolve, 10));

		// Simulate message
		const es = MockEventSource.instances[0];
		es.simulateMessage({ type: 'notification', data: 'hello' });

		expect(messages).toHaveLength(1);
		expect(messages[0]).toEqual({ type: 'notification', data: 'hello' });

		manager.dispose();
	});

	test('should handle errors', async () => {
		let errorReceived = false;
		const manager = new EventStreamManager({
			url: 'http://localhost:3000/events',
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
		const es = MockEventSource.instances[0];
		es.simulateError();

		expect(errorReceived).toBe(true);

		manager.dispose();
	});

	test('should close connection', async () => {
		let disconnected = false;
		const manager = new EventStreamManager({
			url: 'http://localhost:3000/events',
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
		const manager = new EventStreamManager<{ data: string }>({
			url: 'http://localhost:3000/events',
		});

		manager.connect();

		// Wait for connection
		await new Promise((resolve) => setTimeout(resolve, 10));

		// Send messages before setting handler
		const es = MockEventSource.instances[0];
		es.simulateMessage({ data: 'msg1' });
		es.simulateMessage({ data: 'msg2' });

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
		const manager = new EventStreamManager({
			url: 'http://localhost:3000/events',
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

		// Simulate error (should trigger reconnect)
		const es = MockEventSource.instances[0];
		es.simulateError();

		// Wait for reconnection (baseDelay + connection time + buffer)
		await new Promise((resolve) => setTimeout(resolve, 50));

		// Should have attempted reconnection
		expect(MockEventSource.instances.length).toBeGreaterThanOrEqual(2);

		manager.dispose();
	});

	test('should handle multiple messages in sequence', async () => {
		const messages: unknown[] = [];
		const manager = new EventStreamManager({
			url: 'http://localhost:3000/events',
		});

		manager.setMessageHandler((msg) => messages.push(msg));
		manager.connect();

		// Wait for connection
		await new Promise((resolve) => setTimeout(resolve, 10));

		// Simulate multiple messages
		const es = MockEventSource.instances[0];
		es.simulateMessage({ id: 1, text: 'first' });
		es.simulateMessage({ id: 2, text: 'second' });
		es.simulateMessage({ id: 3, text: 'third' });

		expect(messages).toHaveLength(3);
		expect(messages[0]).toEqual({ id: 1, text: 'first' });
		expect(messages[1]).toEqual({ id: 2, text: 'second' });
		expect(messages[2]).toEqual({ id: 3, text: 'third' });

		manager.dispose();
	});

	test('should deserialize JSON messages', async () => {
		const messages: unknown[] = [];
		const manager = new EventStreamManager({
			url: 'http://localhost:3000/events',
		});

		manager.setMessageHandler((msg) => messages.push(msg));
		manager.connect();

		// Wait for connection
		await new Promise((resolve) => setTimeout(resolve, 10));

		// Simulate message with JSON data
		const es = MockEventSource.instances[0];
		es.simulateMessage({ user: 'alice', action: 'login', timestamp: 123456 });

		expect(messages).toHaveLength(1);
		expect(messages[0]).toEqual({ user: 'alice', action: 'login', timestamp: 123456 });

		manager.dispose();
	});
});
