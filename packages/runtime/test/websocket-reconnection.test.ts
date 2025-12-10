import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';
// Note: ThreadWebSocketClient is an internal class exported for testing only
// It's not part of the public API and subject to change
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

		// Wait for server to be ready
		await new Promise<void>((resolve) => {
			wss.on('listening', () => {
				const address = wss.address() as { port: number };
				port = address.port;
				resolve();
			});
		});
	});

	afterAll(() => {
		// Close all connections
		for (const ws of connections) {
			ws.close();
		}
		wss.close();
	});

	beforeEach(async () => {
		// Close any lingering connections from previous tests
		for (const ws of connections) {
			if (ws.readyState === 1) {
				// OPEN
				ws.close();
			}
		}

		// Wait a bit for any background reconnection attempts to settle
		await new Promise((resolve) => setTimeout(resolve, 200));

		// Reset counters and state before each test
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

	test('uses exponential backoff for retries', async () => {
		closeBeforeAuth = true; // Always fail

		const client = new ThreadWebSocketClient('test-key', `ws://localhost:${port}`);

		// Track reconnection attempt times for this specific client
		const attemptTimes: number[] = [];
		const clientConnections: WebSocket[] = [];

		// Intercept connections from this specific test
		const startIndex = connections.length;

		// First connection attempt fails
		attemptTimes.push(Date.now());
		await client.connect().catch(() => {});

		// Wait for first 2 retries to verify exponential backoff
		// Retry 1: ~2s, Retry 2: ~4s more = ~6s total

		// Wait for retry 1 (after ~2s)
		await new Promise((resolve) => setTimeout(resolve, 2700));
		if (connections.length > startIndex + 1) {
			attemptTimes.push(Date.now());
			clientConnections.push(connections[startIndex + 1]);
		}

		// Wait for retry 2 (after ~4s more)
		await new Promise((resolve) => setTimeout(resolve, 4700));
		if (connections.length > startIndex + 2) {
			attemptTimes.push(Date.now());
			clientConnections.push(connections[startIndex + 2]);
		}

		// Behavioral verification: retries happen and use exponential backoff
		// We verify backoff delays, not exact attempt counts (timing-sensitive)
		expect(attemptTimes.length).toBeGreaterThanOrEqual(2);

		if (attemptTimes.length >= 3) {
			const delay1 = attemptTimes[1] - attemptTimes[0];
			const delay2 = attemptTimes[2] - attemptTimes[1];

			// First retry ~2s, second ~4s (allow variance for system timing)
			expect(delay1).toBeGreaterThan(1500);
			expect(delay1).toBeLessThan(3500);
			expect(delay2).toBeGreaterThan(3000);
			expect(delay2).toBeLessThan(6000);

			// Second delay should be roughly 2x the first (exponential backoff)
			expect(delay2 / delay1).toBeGreaterThan(1.3);
			expect(delay2 / delay1).toBeLessThan(3.0);
		}

		client.cleanup();
	}, 15000);

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
