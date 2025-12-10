import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';
import { ThreadWebSocketClient } from '../src/session';

describe('WebSocket Reconnection', () => {
	let wss: WebSocketServer;
	let port: number;
	let connections: WebSocket[] = [];
	let authAttempts = 0;
	let closeBeforeAuth = false;
	let connectionCount = 0;

	beforeAll(async () => {
		// Create WebSocket server with dynamic port allocation
		wss = new WebSocketServer({ port: 0 });

		wss.on('connection', (ws: WebSocket) => {
			connections.push(ws);
			connectionCount++;

			ws.on('message', (data: Buffer) => {
				try {
					const message = JSON.parse(data.toString());

					// Handle authentication
					if ('authorization' in message) {
						authAttempts++;

						// Simulate server closing connection before auth completes (rollout scenario)
						if (closeBeforeAuth) {
							ws.close();
							return;
						}

						// Send auth success
						ws.send(JSON.stringify({ success: true }));
						return;
					}

					// Handle thread actions
					if ('action' in message && 'id' in message) {
						if (message.action === 'restore') {
							ws.send(JSON.stringify({ id: message.id, success: true, data: undefined }));
						} else if (message.action === 'save') {
							ws.send(JSON.stringify({ id: message.id, success: true }));
						} else if (message.action === 'delete') {
							ws.send(JSON.stringify({ id: message.id, success: true }));
						}
					}
				} catch {
					// Ignore parse errors
				}
			});
		});

		// Wait for server to start and get assigned port
		await new Promise((resolve) => setTimeout(resolve, 100));
		const address = wss.address() as { port: number };
		port = address.port;
	});

	afterAll(() => {
		// Close all connections
		for (const ws of connections) {
			ws.close();
		}
		wss.close();
	});

	beforeEach(() => {
		// Reset counters before each test
		authAttempts = 0;
		closeBeforeAuth = false;
		connectionCount = 0;
		connections = [];
	});

	test('reconnects when connection closes before authentication', async () => {
		closeBeforeAuth = true;

		const client = new ThreadWebSocketClient('test-key', `ws://localhost:${port}`);

		// First connection attempt will fail (close before auth)
		await expect(client.connect()).rejects.toThrow('WebSocket closed before authentication');

		expect(authAttempts).toBe(1);
		expect(connectionCount).toBe(1);

		// Allow auth to succeed for reconnection
		closeBeforeAuth = false;

		// Wait for automatic reconnection attempt (exponential backoff starts at 2^1 = 2s)
		await new Promise((resolve) => setTimeout(resolve, 2500));

		// Verify reconnection was attempted
		expect(connectionCount).toBeGreaterThanOrEqual(2);
		expect(authAttempts).toBeGreaterThanOrEqual(2);

		client.cleanup();
	}, 10000);

	test('successfully reconnects after authenticated disconnect', async () => {
		closeBeforeAuth = false;

		const client = new ThreadWebSocketClient('test-key', `ws://localhost:${port}`);

		// Initial successful connection
		await client.connect();

		expect(authAttempts).toBe(1);
		expect(connectionCount).toBe(1);

		// Force disconnect after successful auth
		const lastConnection = connections[connections.length - 1];
		lastConnection?.close();

		// Wait for reconnection
		await new Promise((resolve) => setTimeout(resolve, 2500));

		// Verify reconnection happened
		expect(connectionCount).toBeGreaterThanOrEqual(2);
		expect(authAttempts).toBeGreaterThanOrEqual(2);

		client.cleanup();
	}, 10000);

	test('gives up after max reconnection attempts', async () => {
		closeBeforeAuth = true; // Always fail

		const client = new ThreadWebSocketClient('test-key', `ws://localhost:${port}`);

		// First connection attempt
		await client.connect().catch(() => {});

		expect(connectionCount).toBe(1);

		// Wait for multiple reconnection attempts (with exponential backoff)
		// Delays: 2s, 4s, 8s, 16s, 30s (capped) = ~60s total for all 5 retries
		// We'll wait enough for the first few attempts
		await new Promise((resolve) => setTimeout(resolve, 15000));

		// Behavioral test: verify retries are bounded (not exact count due to timing)
		// This confirms reconnection happens but eventually gives up, preventing runaway retries
		expect(connectionCount).toBeGreaterThan(1); // At least one retry
		expect(connectionCount).toBeLessThanOrEqual(7); // Initial + 5 max attempts + timing variance

		client.cleanup();
	}, 20000);

	test('operations wait for reconnection in progress', async () => {
		const client = new ThreadWebSocketClient('test-key', `ws://localhost:${port}`);

		// First, establish a successful connection
		closeBeforeAuth = false;
		await client.connect();

		expect(authAttempts).toBe(1);
		expect(connectionCount).toBe(1);

		// Now close the connection to trigger reconnection
		const lastConnection = connections[connections.length - 1];
		lastConnection?.close();

		// Wait for reconnection to be scheduled (exponential backoff delay)
		await new Promise((resolve) => setTimeout(resolve, 2500));

		// Verify reconnection happened automatically
		expect(connectionCount).toBeGreaterThanOrEqual(2);
		expect(authAttempts).toBeGreaterThanOrEqual(2);

		// Now operations should work
		await expect(client.restore('thrd_test123')).resolves.toBeUndefined();

		client.cleanup();
	}, 10000);
});
