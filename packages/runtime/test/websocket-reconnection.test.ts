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
	let authFailure = false;

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

						// Simulate authentication failure
						if (authFailure) {
							ws.send(JSON.stringify({ success: false, error: 'Invalid API key' }));
							// Close the connection after sending auth failure
							setTimeout(() => ws.close(), 10);
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

	beforeEach(() => {
		// Close any lingering connections from previous tests
		for (const ws of connections) {
			if (ws.readyState === 1) {
				// OPEN
				ws.close();
			}
		}

		// Reset counters and state before each test
		authAttempts = 0;
		closeBeforeAuth = false;
		authFailure = false;
		connectionCount = 0;
		connections = [];
	});

	test('reconnects transparently when connection closes before authentication', async () => {
		// Simulate server rollout: first connection closes before auth, second succeeds
		closeBeforeAuth = true;

		const client = new ThreadWebSocketClient('test-key', `ws://localhost:${port}`);

		// Start connection - should not throw immediately
		const connectPromise = client.connect();

		// Wait a bit for first connection attempt
		await new Promise((resolve) => setTimeout(resolve, 100));

		// Verify first connection attempted auth
		expect(authAttempts).toBeGreaterThanOrEqual(1);
		expect(connectionCount).toBeGreaterThanOrEqual(1);

		// Allow auth to succeed on next attempt (simulating server coming back online)
		closeBeforeAuth = false;

		// The original connect() promise should resolve after automatic reconnection
		await expect(connectPromise).resolves.toBeUndefined();

		// Verify reconnection happened
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

		// Track connection attempt times
		const attemptTimes: number[] = [];

		// Intercept connections from this specific test
		const startIndex = connections.length;

		// First connection attempt fails
		attemptTimes.push(Date.now());
		client.connect().catch(() => {}); // Don't wait, just track

		// Wait for first 2 retries to verify exponential backoff pattern
		// Expected: retry 1 after ~2s, retry 2 after ~4s more = ~6s total

		// Wait for retry 1 (scheduled after ~2s)
		await new Promise((resolve) => setTimeout(resolve, 2700));
		if (connections.length > startIndex + 1) {
			attemptTimes.push(Date.now());
		}

		// Wait for retry 2 (scheduled after ~4s more)
		await new Promise((resolve) => setTimeout(resolve, 4700));
		if (connections.length > startIndex + 2) {
			attemptTimes.push(Date.now());
		}

		// Verify retries happened and delays grow exponentially
		expect(attemptTimes.length).toBeGreaterThanOrEqual(2);

		if (attemptTimes.length >= 3) {
			const delay1 = attemptTimes[1] - attemptTimes[0];
			const delay2 = attemptTimes[2] - attemptTimes[1];

			// First retry ~2s, second ~4s (allow variance for system timing + overhead)
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

	test('gives up after max reconnection attempts and rejects initial promise', async () => {
		// Always close before auth to exhaust all retry attempts
		closeBeforeAuth = true;

		const client = new ThreadWebSocketClient('test-key', `ws://localhost:${port}`);

		// The connect should eventually fail after all retries are exhausted
		// Max attempts = 5, exponential backoff: 2s, 4s, 8s, 16s, 30s (capped)
		// This will take ~60 seconds total
		await expect(client.connect()).rejects.toThrow(
			/WebSocket closed before authentication after \d+ attempts/
		);

		// Verify we made the expected number of connection attempts (1 initial + 5 retries)
		expect(connectionCount).toBeGreaterThanOrEqual(5);
		expect(authAttempts).toBeGreaterThanOrEqual(5);

		client.cleanup();
	}, 70000);

	test('handles authentication failure (not retried)', async () => {
		// Simulate actual auth failure (bad API key)
		authFailure = true;

		const client = new ThreadWebSocketClient('test-key', `ws://localhost:${port}`);

		// Auth failure should reject (message may vary due to timing of close event)
		await expect(client.connect()).rejects.toThrow();

		// Should only have tried once (no retries for auth failures)
		expect(authAttempts).toBe(1);
		expect(connectionCount).toBe(1);

		client.cleanup();
	}, 10000);

	test('handles connection errors during initial connect', async () => {
		// Try to connect to a port that doesn't exist
		const client = new ThreadWebSocketClient('test-key', 'ws://localhost:99999');

		// Should fail with connection error
		await expect(client.connect()).rejects.toThrow(/WebSocket error|ECONNREFUSED|Invalid url/);

		client.cleanup();
	}, 15000);

	test('cleanup stops reconnection attempts', async () => {
		closeBeforeAuth = true;

		const client = new ThreadWebSocketClient('test-key', `ws://localhost:${port}`);

		// Start connection (will fail and schedule reconnection)
		client.connect().catch(() => {});

		// Wait for first connection attempt
		await new Promise((resolve) => setTimeout(resolve, 200));

		const countBeforeCleanup = connectionCount;

		// Cleanup should stop reconnection timer
		client.cleanup();

		// Wait for what would have been the reconnection delay
		await new Promise((resolve) => setTimeout(resolve, 3000));

		// No new connections should have been made after cleanup
		expect(connectionCount).toBe(countBeforeCleanup);
	}, 10000);

	test('multiple sequential connects after close before auth', async () => {
		// First connection: close before auth, then allow success
		closeBeforeAuth = true;

		const client = new ThreadWebSocketClient('test-key', `ws://localhost:${port}`);

		const firstConnect = client.connect();

		// Wait a bit
		await new Promise((resolve) => setTimeout(resolve, 100));

		// Allow auth to succeed
		closeBeforeAuth = false;

		// First connect should succeed via reconnection
		await expect(firstConnect).resolves.toBeUndefined();

		// Manually close the connection
		const lastConnection = connections[connections.length - 1];
		lastConnection?.close();

		// Wait for auto-reconnection
		await new Promise((resolve) => setTimeout(resolve, 2500));

		// Operations should still work
		await expect(client.restore('thrd_test456')).resolves.toBeUndefined();

		client.cleanup();
	}, 10000);
});
