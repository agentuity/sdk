/**
 * Integration tests for WebSocket thread persistence.
 * Tests the full lifecycle of thread state save/restore via WebSocket.
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';
import {
	ThreadWebSocketClient,
	parseThreadData,
	type ThreadWebSocketClientOptions,
} from '../src/session';

const testOptions: ThreadWebSocketClientOptions = {
	connectionTimeoutMs: 100,
	requestTimeoutMs: 100,
	reconnectBaseDelayMs: 10,
	reconnectMaxDelayMs: 300,
	maxReconnectAttempts: 5,
};

describe('WebSocket Thread Persistence', () => {
	let wss: WebSocketServer;
	let port: number;
	let connections: WebSocket[] = [];
	let storedThreads: Map<string, string>;

	beforeAll(async () => {
		storedThreads = new Map();

		wss = new WebSocketServer({ port: 0 });

		wss.on('connection', (ws: WebSocket) => {
			connections.push(ws);

			ws.on('message', (data: Buffer) => {
				try {
					const message = JSON.parse(data.toString());

					if ('authorization' in message) {
						ws.send(JSON.stringify({ success: true }));
						return;
					}

					if ('action' in message && 'id' in message) {
						if (message.action === 'restore') {
							const threadId = message.data.thread_id;
							const stored = storedThreads.get(threadId);
							ws.send(
								JSON.stringify({
									id: message.id,
									success: true,
									data: stored,
								})
							);
						} else if (message.action === 'save') {
							const threadId = message.data.thread_id;
							const userData = message.data.user_data;
							storedThreads.set(threadId, userData);
							ws.send(JSON.stringify({ id: message.id, success: true }));
						} else if (message.action === 'delete') {
							const threadId = message.data.thread_id;
							storedThreads.delete(threadId);
							ws.send(JSON.stringify({ id: message.id, success: true }));
						}
					}
				} catch {
					// Ignore parse errors
				}
			});
		});

		await new Promise<void>((resolve) => {
			wss.on('listening', () => {
				const address = wss.address() as { port: number };
				port = address.port;
				resolve();
			});
		});
	});

	afterAll(() => {
		for (const ws of connections) {
			ws.close();
		}
		wss.close();
	});

	beforeEach(() => {
		for (const ws of connections) {
			if (ws.readyState === 1) {
				ws.close();
			}
		}
		connections = [];
		storedThreads.clear();
	});

	test('saves thread state in new envelope format', async () => {
		const client = new ThreadWebSocketClient('test-key', `ws://localhost:${port}`, testOptions);
		await client.connect();

		const stateData = JSON.stringify({
			state: { messages: ['hello', 'world'] },
			metadata: { userId: 'user123' },
		});

		await client.save('thrd_test1', stateData);

		const stored = storedThreads.get('thrd_test1');
		expect(stored).toBe(stateData);

		client.cleanup();
	});

	test('restores thread state correctly', async () => {
		const stateData = JSON.stringify({
			state: { messages: ['saved', 'message'] },
			metadata: { role: 'admin' },
		});
		storedThreads.set('thrd_test2', stateData);

		const client = new ThreadWebSocketClient('test-key', `ws://localhost:${port}`, testOptions);
		await client.connect();

		const restored = await client.restore('thrd_test2');

		expect(restored).toBe(stateData);

		const { flatStateJson, metadata } = parseThreadData(restored);
		expect(flatStateJson).toBe(JSON.stringify({ messages: ['saved', 'message'] }));
		expect(metadata).toEqual({ role: 'admin' });

		client.cleanup();
	});

	test('returns undefined for non-existent thread', async () => {
		const client = new ThreadWebSocketClient('test-key', `ws://localhost:${port}`, testOptions);
		await client.connect();

		const restored = await client.restore('thrd_nonexistent');

		expect(restored).toBeUndefined();

		client.cleanup();
	});

	test('deletes thread from storage', async () => {
		storedThreads.set('thrd_delete', JSON.stringify({ state: { data: 'to delete' } }));

		const client = new ThreadWebSocketClient('test-key', `ws://localhost:${port}`, testOptions);
		await client.connect();

		await client.delete('thrd_delete');

		expect(storedThreads.has('thrd_delete')).toBe(false);

		client.cleanup();
	});

	test('full round-trip: save -> restore -> modify -> save -> restore', async () => {
		const client = new ThreadWebSocketClient('test-key', `ws://localhost:${port}`, testOptions);
		await client.connect();

		const state1 = JSON.stringify({
			state: { messages: ['first'] },
			metadata: { userId: 'user1' },
		});
		await client.save('thrd_roundtrip', state1);

		const restored1 = await client.restore('thrd_roundtrip');
		const { flatStateJson: flat1 } = parseThreadData(restored1);
		expect(JSON.parse(flat1!)).toEqual({ messages: ['first'] });

		const state2 = JSON.stringify({
			state: { messages: ['first', 'second'] },
			metadata: { userId: 'user1' },
		});
		await client.save('thrd_roundtrip', state2);

		const restored2 = await client.restore('thrd_roundtrip');
		const { flatStateJson: flat2 } = parseThreadData(restored2);
		expect(JSON.parse(flat2!)).toEqual({ messages: ['first', 'second'] });

		client.cleanup();
	});

	test('handles old format data on restore', async () => {
		const oldFormatData = JSON.stringify({ messages: ['old', 'format'], counter: 5 });
		storedThreads.set('thrd_oldformat', oldFormatData);

		const client = new ThreadWebSocketClient('test-key', `ws://localhost:${port}`, testOptions);
		await client.connect();

		const restored = await client.restore('thrd_oldformat');
		const { flatStateJson, metadata } = parseThreadData(restored);

		expect(flatStateJson).toBe(oldFormatData);
		expect(metadata).toBeUndefined();

		const parsed = JSON.parse(flatStateJson!);
		expect(parsed.messages).toEqual(['old', 'format']);
		expect(parsed.counter).toBe(5);

		client.cleanup();
	});

	test('handles complex nested state', async () => {
		const client = new ThreadWebSocketClient('test-key', `ws://localhost:${port}`, testOptions);
		await client.connect();

		const complexState = {
			state: {
				messages: [
					{ id: '1', content: 'hello', metadata: { sentiment: 'positive' } },
					{ id: '2', content: 'world', metadata: { sentiment: 'neutral' } },
				],
				config: {
					nested: { deeply: { value: 42 } },
				},
			},
			metadata: { userId: 'user123', tags: ['important', 'urgent'] },
		};

		await client.save('thrd_complex', JSON.stringify(complexState));

		const restored = await client.restore('thrd_complex');
		const { flatStateJson, metadata } = parseThreadData(restored);

		const state = JSON.parse(flatStateJson!);
		expect(state.messages).toHaveLength(2);
		expect(state.messages[0].metadata.sentiment).toBe('positive');
		expect(state.config.nested.deeply.value).toBe(42);
		expect(metadata?.tags).toEqual(['important', 'urgent']);

		client.cleanup();
	});

	test('multiple threads are isolated', async () => {
		const client = new ThreadWebSocketClient('test-key', `ws://localhost:${port}`, testOptions);
		await client.connect();

		await client.save('thrd_a', JSON.stringify({ state: { value: 'a' } }));
		await client.save('thrd_b', JSON.stringify({ state: { value: 'b' } }));
		await client.save('thrd_c', JSON.stringify({ state: { value: 'c' } }));

		const restoredA = await client.restore('thrd_a');
		const restoredB = await client.restore('thrd_b');
		const restoredC = await client.restore('thrd_c');

		expect(JSON.parse(parseThreadData(restoredA).flatStateJson!)).toEqual({ value: 'a' });
		expect(JSON.parse(parseThreadData(restoredB).flatStateJson!)).toEqual({ value: 'b' });
		expect(JSON.parse(parseThreadData(restoredC).flatStateJson!)).toEqual({ value: 'c' });

		client.cleanup();
	});

	test('overwriting thread replaces all data', async () => {
		const client = new ThreadWebSocketClient('test-key', `ws://localhost:${port}`, testOptions);
		await client.connect();

		await client.save(
			'thrd_overwrite',
			JSON.stringify({
				state: { old: 'data', toRemove: true },
			})
		);

		await client.save(
			'thrd_overwrite',
			JSON.stringify({
				state: { new: 'data' },
			})
		);

		const restored = await client.restore('thrd_overwrite');
		const { flatStateJson } = parseThreadData(restored);
		const state = JSON.parse(flatStateJson!);

		expect(state.new).toBe('data');
		expect(state.old).toBeUndefined();
		expect(state.toRemove).toBeUndefined();

		client.cleanup();
	});
});
