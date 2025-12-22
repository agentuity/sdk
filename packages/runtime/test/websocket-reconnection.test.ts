import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';
// Note: ThreadWebSocketClient is an internal class exported for testing only
// It's not part of the public API and subject to change
import { ThreadWebSocketClient, type ThreadWebSocketClientOptions } from '../src/session';

// Test configuration: scale down timeouts to ~1/100 of production values
const testOptions: ThreadWebSocketClientOptions = {
	connectionTimeoutMs: 100, // instead of 10_000
	requestTimeoutMs: 100, // instead of 10_000
	reconnectBaseDelayMs: 10, // backoff: 20ms, 40ms, 80ms, 160ms, 300ms
	reconnectMaxDelayMs: 300,
	maxReconnectAttempts: 5,
};

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

		const client = new ThreadWebSocketClient('test-key', `ws://localhost:${port}`, testOptions);

		// Start connection - should not throw immediately
		const connectPromise = client.connect();

		// Wait for first connection attempt (give WebSocket events time to process)
		await Bun.sleep(20);

		// Verify first connection attempted auth
		expect(authAttempts).toBeGreaterThanOrEqual(1);
		expect(connectionCount).toBeGreaterThanOrEqual(1);

		// Allow auth to succeed on next attempt (simulating server coming back online)
		closeBeforeAuth = false;

		// Wait for reconnection (first retry after ~20ms with backoff)
		await Bun.sleep(50);

		// The original connect() promise should resolve after automatic reconnection
		await expect(connectPromise).resolves.toBeUndefined();

		// Verify reconnection happened
		expect(connectionCount).toBeGreaterThanOrEqual(2);
		expect(authAttempts).toBeGreaterThanOrEqual(2);

		client.cleanup();
	});

	test('successfully reconnects after authenticated disconnect', async () => {
		closeBeforeAuth = false;

		const client = new ThreadWebSocketClient('test-key', `ws://localhost:${port}`, testOptions);

		// Initial successful connection
		await client.connect();

		expect(authAttempts).toBe(1);
		expect(connectionCount).toBe(1);

		// Force disconnect after successful auth
		const lastConnection = connections[connections.length - 1];
		lastConnection?.close();

		// Wait for reconnection (first retry after ~20ms with backoff)
		await Bun.sleep(50);

		// Verify reconnection happened
		expect(connectionCount).toBeGreaterThanOrEqual(2);
		expect(authAttempts).toBeGreaterThanOrEqual(2);

		client.cleanup();
	});

	test('uses exponential backoff for retries', async () => {
		closeBeforeAuth = true; // Always fail

		const client = new ThreadWebSocketClient('test-key', `ws://localhost:${port}`, testOptions);

		// Intercept connections from this specific test
		const startIndex = connections.length;

		// First connection attempt fails
		client.connect().catch(() => {}); // Don't wait, just track

		// Wait for initial connection
		await Bun.sleep(10);
		const countAfterFirst = connections.length;

		// Wait for retry 1 (scheduled after ~20ms with exponential backoff)
		await Bun.sleep(30);
		const countAfterRetry1 = connections.length;

		// Wait for retry 2 (scheduled after ~40ms more with exponential backoff)
		await Bun.sleep(60);
		const countAfterRetry2 = connections.length;

		// Verify retries happened
		expect(countAfterFirst).toBeGreaterThanOrEqual(startIndex + 1); // Initial attempt
		expect(countAfterRetry1).toBeGreaterThanOrEqual(countAfterFirst + 1); // First retry
		expect(countAfterRetry2).toBeGreaterThanOrEqual(countAfterRetry1 + 1); // Second retry

		client.cleanup();
	});

	test('operations wait for reconnection in progress', async () => {
		const client = new ThreadWebSocketClient('test-key', `ws://localhost:${port}`, testOptions);

		// First, establish a successful connection
		closeBeforeAuth = false;
		await client.connect();

		expect(authAttempts).toBe(1);
		expect(connectionCount).toBe(1);

		// Now close the connection to trigger reconnection
		const lastConnection = connections[connections.length - 1];
		lastConnection?.close();

		// Wait for reconnection to be scheduled (exponential backoff delay)
		await Bun.sleep(50);

		// Verify reconnection happened automatically
		expect(connectionCount).toBeGreaterThanOrEqual(2);
		expect(authAttempts).toBeGreaterThanOrEqual(2);

		// Now operations should work
		await expect(client.restore('thrd_test123')).resolves.toBeUndefined();

		client.cleanup();
	});

	test('gives up after max reconnection attempts and rejects initial promise', async () => {
		// Always close before auth to exhaust all retry attempts
		closeBeforeAuth = true;

		const client = new ThreadWebSocketClient('test-key', `ws://localhost:${port}`, testOptions);

		// Start connect (will fail after all retries)
		const connectPromise = client.connect();

		// Wait for all retry attempts to complete
		// Max attempts = 5, exponential backoff: 20ms, 40ms, 80ms, 160ms, 300ms (capped)
		// Total time is comfortably covered by 600ms
		await Bun.sleep(600);

		// The connect should eventually fail after all retries are exhausted
		await expect(connectPromise).rejects.toThrow(
			/WebSocket closed before authentication after \d+ attempts/
		);

		// Verify we made the expected number of connection attempts (1 initial + 5 retries)
		expect(connectionCount).toBeGreaterThanOrEqual(5);
		expect(authAttempts).toBeGreaterThanOrEqual(5);

		client.cleanup();
	});

	test('handles authentication failure (not retried)', async () => {
		// Simulate actual auth failure (bad API key)
		authFailure = true;

		const client = new ThreadWebSocketClient('test-key', `ws://localhost:${port}`, testOptions);

		// Auth failure should reject (message may vary due to timing of close event)
		await expect(client.connect()).rejects.toThrow();

		// Should only have tried once (no retries for auth failures)
		expect(authAttempts).toBe(1);
		expect(connectionCount).toBe(1);

		client.cleanup();
	});

	test('handles connection errors during initial connect', async () => {
		// Try to connect to a port that doesn't exist
		const client = new ThreadWebSocketClient('test-key', 'ws://localhost:99999', testOptions);

		// Should fail with connection error
		await expect(client.connect()).rejects.toThrow(/WebSocket error|ECONNREFUSED|Invalid url/);

		client.cleanup();
	});

	test('cleanup stops reconnection attempts', async () => {
		closeBeforeAuth = true;

		const client = new ThreadWebSocketClient('test-key', `ws://localhost:${port}`, testOptions);

		// Start connection (will fail and schedule reconnection)
		client.connect().catch(() => {});

		// Wait for first connection attempt
		await Bun.sleep(10);

		const countBeforeCleanup = connectionCount;

		// Cleanup should stop reconnection timer
		client.cleanup();

		// Wait for what would have been the reconnection delay
		await Bun.sleep(50);

		// No new connections should have been made after cleanup
		expect(connectionCount).toBe(countBeforeCleanup);
	});

	test('multiple sequential connects after close before auth', async () => {
		// First connection: close before auth, then allow success
		closeBeforeAuth = true;

		const client = new ThreadWebSocketClient('test-key', `ws://localhost:${port}`, testOptions);

		const firstConnect = client.connect();

		// Wait a bit
		await Bun.sleep(10);

		// Allow auth to succeed
		closeBeforeAuth = false;

		// Wait for reconnection
		await Bun.sleep(50);

		// First connect should succeed via reconnection
		await expect(firstConnect).resolves.toBeUndefined();

		// Manually close the connection
		const lastConnection = connections[connections.length - 1];
		lastConnection?.close();

		// Wait for auto-reconnection
		await Bun.sleep(50);

		// Operations should still work
		await expect(client.restore('thrd_test456')).resolves.toBeUndefined();

		client.cleanup();
	});
});
