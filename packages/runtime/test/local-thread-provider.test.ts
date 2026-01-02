/**
 * Integration tests for LocalThreadProvider logic.
 * Tests thread persistence by directly testing the save/restore format handling.
 */

import { test, expect, describe } from 'bun:test';
import { DefaultThread, parseThreadData, type ThreadProvider } from '../src/session';

// Helper to create a thread with initial state
function createThread(
	provider: ThreadProvider,
	id: string,
	initialState?: Record<string, unknown>,
	initialMetadata?: Record<string, unknown>
) {
	const restoreFn = async () => ({
		state: new Map(Object.entries(initialState || {})),
		metadata: initialMetadata || {},
	});
	return new DefaultThread(provider, id, restoreFn, initialMetadata);
}

describe('LocalThreadProvider format handling', () => {
	const mockProvider = {} as ThreadProvider;

	test('saves and restores thread state correctly using getSerializedState', async () => {
		const restoreFn1 = async () => ({ state: new Map(), metadata: {} });
		const thread1 = new DefaultThread(mockProvider, 'thrd_test123', restoreFn1);

		await thread1.state.set('messages', [{ id: '1', content: 'hello' }]);
		await thread1.state.set('counter', 42);

		const serialized = await thread1.getSerializedState();

		const { flatStateJson, metadata } = parseThreadData(serialized);
		const restoredState = flatStateJson ? JSON.parse(flatStateJson) : {};
		const thread2 = createThread(mockProvider, 'thrd_test123', restoredState, metadata);

		expect(await thread2.state.get('messages')).toEqual([{ id: '1', content: 'hello' }]);
		expect(await thread2.state.get('counter')).toBe(42);
	});

	test('restores metadata correctly', async () => {
		const restoreFn1 = async () => ({ state: new Map(), metadata: {} });
		const thread1 = new DefaultThread(mockProvider, 'thrd_test456', restoreFn1);

		await thread1.state.set('data', 'test');
		await thread1.setMetadata({ userId: 'user123', role: 'admin' });

		const serialized = await thread1.getSerializedState();

		const { flatStateJson, metadata } = parseThreadData(serialized);
		const restoredState = flatStateJson ? JSON.parse(flatStateJson) : {};
		const thread2 = createThread(mockProvider, 'thrd_test456', restoredState, metadata);

		const restoredMeta = await thread2.getMetadata();
		expect(restoredMeta.userId).toBe('user123');
		expect(restoredMeta.role).toBe('admin');
	});

	test('multiple save/restore cycles preserve state correctly', async () => {
		let serialized: string;

		// First thread
		const restoreFn1 = async () => ({ state: new Map(), metadata: {} });
		const thread1 = new DefaultThread(mockProvider, 'thrd_multi', restoreFn1);
		await thread1.state.set('messages', ['msg1']);
		serialized = await thread1.getSerializedState();

		// Second thread
		const { flatStateJson: flat1, metadata: meta1 } = parseThreadData(serialized);
		const state1 = flat1 ? JSON.parse(flat1) : {};
		const thread2 = createThread(mockProvider, 'thrd_multi', state1, meta1);
		const messages2 = (await thread2.state.get<string[]>('messages')) || [];
		messages2.push('msg2');
		await thread2.state.set('messages', messages2);
		serialized = await thread2.getSerializedState();

		// Third thread
		const { flatStateJson: flat2, metadata: meta2 } = parseThreadData(serialized);
		const state2 = flat2 ? JSON.parse(flat2) : {};
		const thread3 = createThread(mockProvider, 'thrd_multi', state2, meta2);
		const messages3 = (await thread3.state.get<string[]>('messages')) || [];
		messages3.push('msg3');
		await thread3.state.set('messages', messages3);
		serialized = await thread3.getSerializedState();

		// Fourth thread - verify final state
		const { flatStateJson: flat3, metadata: meta3 } = parseThreadData(serialized);
		const state3 = flat3 ? JSON.parse(flat3) : {};
		const thread4 = createThread(mockProvider, 'thrd_multi', state3, meta3);

		expect(await thread4.state.get('messages')).toEqual(['msg1', 'msg2', 'msg3']);
	});

	test('does not mark as dirty if not modified after restore', async () => {
		const restoreFn1 = async () => ({ state: new Map(), metadata: {} });
		const thread1 = new DefaultThread(mockProvider, 'thrd_nodirty', restoreFn1);
		await thread1.state.set('value', 'original');
		const serialized = await thread1.getSerializedState();

		const { flatStateJson, metadata } = parseThreadData(serialized);
		const restoredState = flatStateJson ? JSON.parse(flatStateJson) : {};
		const thread2 = createThread(mockProvider, 'thrd_nodirty', restoredState, metadata);

		// Just read - don't modify
		await thread2.state.get('value');

		expect(thread2.state.dirty).toBe(false);
	});

	test('handles empty thread correctly', async () => {
		const restoreFn = async () => ({ state: new Map(), metadata: {} });
		const thread = new DefaultThread(mockProvider, 'thrd_empty', restoreFn);

		const size = await thread.state.size();
		const metadata = await thread.getMetadata();

		expect(size).toBe(0);
		expect(Object.keys(metadata)).toHaveLength(0);
		expect(thread.state.dirty).toBe(false);
	});

	test('handles backwards compatible old format data', async () => {
		const oldFormatData = JSON.stringify({ messages: ['old', 'data'], counter: 10 });

		const { flatStateJson, metadata } = parseThreadData(oldFormatData);
		const restoredState = flatStateJson ? JSON.parse(flatStateJson) : {};
		const thread = createThread(mockProvider, 'thrd_oldformat', restoredState, metadata);

		expect(await thread.state.get('messages')).toEqual(['old', 'data']);
		expect(await thread.state.get('counter')).toBe(10);
		expect(await thread.state.has('state')).toBe(false);
	});

	test('handles new format data correctly', async () => {
		const newFormatData = JSON.stringify({
			state: { messages: ['new', 'format'] },
			metadata: { userId: 'user789' },
		});

		const { flatStateJson, metadata } = parseThreadData(newFormatData);
		const restoredState = flatStateJson ? JSON.parse(flatStateJson) : {};
		const thread = createThread(mockProvider, 'thrd_newformat', restoredState, metadata);

		expect(await thread.state.get('messages')).toEqual(['new', 'format']);
		expect(await thread.state.has('state')).toBe(false);

		const restoredMeta = await thread.getMetadata();
		expect(restoredMeta.userId).toBe('user789');
	});

	test('complex state with nested objects persists correctly', async () => {
		const restoreFn1 = async () => ({ state: new Map(), metadata: {} });
		const thread1 = new DefaultThread(mockProvider, 'thrd_complex', restoreFn1);

		const complexState = {
			messages: [
				{ id: '1', content: 'hello', metadata: { sentiment: 'positive' } },
				{ id: '2', content: 'world', metadata: { sentiment: 'neutral' } },
			],
			config: {
				nested: {
					deeply: {
						value: 42,
						array: [1, 2, 3],
					},
				},
			},
		};

		await thread1.state.set('data', complexState);
		const serialized = await thread1.getSerializedState();

		const { flatStateJson, metadata } = parseThreadData(serialized);
		const restoredState = flatStateJson ? JSON.parse(flatStateJson) : {};
		const thread2 = createThread(mockProvider, 'thrd_complex', restoredState, metadata);

		const restored = await thread2.state.get<typeof complexState>('data');

		expect(restored?.messages).toHaveLength(2);
		expect(restored?.messages[0].metadata.sentiment).toBe('positive');
		expect(restored?.config.nested.deeply.value).toBe(42);
		expect(restored?.config.nested.deeply.array).toEqual([1, 2, 3]);
	});

	test('data with "state" key is interpreted as new format', async () => {
		const dataWithStateKey = JSON.stringify({
			state: { actualData: 'stored in state wrapper' },
			metadata: { userId: 'user123' },
		});

		const { flatStateJson, metadata } = parseThreadData(dataWithStateKey);

		expect(flatStateJson).toBe(JSON.stringify({ actualData: 'stored in state wrapper' }));
		expect(metadata).toEqual({ userId: 'user123' });

		const restoredState = flatStateJson ? JSON.parse(flatStateJson) : {};
		const thread = createThread(mockProvider, 'thrd_test', restoredState, metadata);

		expect(await thread.state.get('actualData')).toBe('stored in state wrapper');
		expect(await thread.state.has('state')).toBe(false);
	});
});
