/**
 * Tests for thread state persistence.
 * Validates that thread state is correctly serialized, saved, and restored.
 */

import { test, expect, describe } from 'bun:test';
import { DefaultThread, LazyThreadState, parseThreadData, type ThreadProvider } from '../src/session';

describe('parseThreadData', () => {
	test('returns empty object for undefined input', () => {
		const result = parseThreadData(undefined);
		expect(result).toEqual({});
	});

	test('returns empty object for empty string', () => {
		const result = parseThreadData('');
		expect(result).toEqual({});
	});

	test('handles new format with state only', () => {
		const input = JSON.stringify({ state: { messages: ['hello', 'world'] } });
		const result = parseThreadData(input);

		expect(result.flatStateJson).toBe(JSON.stringify({ messages: ['hello', 'world'] }));
		expect(result.metadata).toBeUndefined();
	});

	test('handles new format with metadata only', () => {
		const input = JSON.stringify({ metadata: { userId: 'user123' } });
		const result = parseThreadData(input);

		expect(result.flatStateJson).toBeUndefined();
		expect(result.metadata).toEqual({ userId: 'user123' });
	});

	test('handles new format with both state and metadata', () => {
		const input = JSON.stringify({
			state: { messages: ['test'] },
			metadata: { userId: 'user123', role: 'admin' },
		});
		const result = parseThreadData(input);

		expect(result.flatStateJson).toBe(JSON.stringify({ messages: ['test'] }));
		expect(result.metadata).toEqual({ userId: 'user123', role: 'admin' });
	});

	test('handles old flat format (backwards compatibility)', () => {
		const input = JSON.stringify({ messages: ['old', 'format'], counter: 42 });
		const result = parseThreadData(input);

		expect(result.flatStateJson).toBe(input);
		expect(result.metadata).toBeUndefined();
	});

	test('handles invalid JSON gracefully', () => {
		const result = parseThreadData('not valid json {{{');

		expect(result.flatStateJson).toBe('not valid json {{{');
		expect(result.metadata).toBeUndefined();
	});

	test('handles non-object JSON values', () => {
		const result = parseThreadData('"just a string"');
		expect(result.flatStateJson).toBe('"just a string"');
	});

	test('handles null metadata gracefully', () => {
		const input = JSON.stringify({ state: { key: 'value' }, metadata: null });
		const result = parseThreadData(input);

		expect(result.flatStateJson).toBe(JSON.stringify({ key: 'value' }));
		expect(result.metadata).toBeUndefined();
	});

	test('handles non-object metadata gracefully', () => {
		const input = JSON.stringify({ state: { key: 'value' }, metadata: 'invalid' });
		const result = parseThreadData(input);

		expect(result.flatStateJson).toBe(JSON.stringify({ key: 'value' }));
		expect(result.metadata).toBeUndefined();
	});
});

describe('LazyThreadState', () => {
	test('starts in idle state', () => {
		const restoreFn = async () => ({ state: new Map(), metadata: {} });
		const state = new LazyThreadState(restoreFn);

		expect(state.loaded).toBe(false);
		expect(state.dirty).toBe(false);
	});

	test('loaded becomes true after get()', async () => {
		const restoreFn = async () => ({ state: new Map([['key', 'value']]), metadata: {} });
		const state = new LazyThreadState(restoreFn);

		await state.get('key');

		expect(state.loaded).toBe(true);
	});

	test('dirty becomes true after set() without load', async () => {
		const restoreFn = async () => ({ state: new Map(), metadata: {} });
		const state = new LazyThreadState(restoreFn);

		await state.set('key', 'value');

		expect(state.loaded).toBe(false);
		expect(state.dirty).toBe(true);
	});

	test('get() returns value after set()', async () => {
		const restoreFn = async () => ({ state: new Map(), metadata: {} });
		const state = new LazyThreadState(restoreFn);

		await state.set('key', 'value');
		const result = await state.get('key');

		expect(result).toBe('value');
		expect(state.loaded).toBe(true);
	});

	test('pending operations are applied on load', async () => {
		const initialState = new Map([['existing', 'data']]);
		const restoreFn = async () => ({ state: initialState, metadata: {} });
		const state = new LazyThreadState(restoreFn);

		await state.set('new', 'value');
		await state.delete('existing');

		const newVal = await state.get('new');
		const existingVal = await state.get('existing');

		expect(newVal).toBe('value');
		expect(existingVal).toBeUndefined();
	});

	test('clear() replaces all pending operations', async () => {
		const restoreFn = async () => ({ state: new Map([['old', 'data']]), metadata: {} });
		const state = new LazyThreadState(restoreFn);

		await state.set('key1', 'value1');
		await state.clear();
		await state.set('key2', 'value2');

		const keys = await state.keys();

		expect(keys).toEqual(['key2']);
	});

	test('size() returns correct count', async () => {
		const restoreFn = async () => ({ state: new Map([['a', 1], ['b', 2]]), metadata: {} });
		const state = new LazyThreadState(restoreFn);

		const size = await state.size();
		expect(size).toBe(2);
	});

	test('entries() returns all entries', async () => {
		const restoreFn = async () => ({ state: new Map([['a', 1], ['b', 2]]), metadata: {} });
		const state = new LazyThreadState(restoreFn);

		const entries = await state.entries<number>();
		expect(entries).toEqual([['a', 1], ['b', 2]]);
	});

	test('values() returns all values', async () => {
		const restoreFn = async () => ({ state: new Map([['a', 1], ['b', 2]]), metadata: {} });
		const state = new LazyThreadState(restoreFn);

		const values = await state.values<number>();
		expect(values).toEqual([1, 2]);
	});

	test('has() returns correct result', async () => {
		const restoreFn = async () => ({ state: new Map([['key', 'value']]), metadata: {} });
		const state = new LazyThreadState(restoreFn);

		expect(await state.has('key')).toBe(true);
		expect(await state.has('nonexistent')).toBe(false);
	});

	test('push() queues operation when not loaded', async () => {
		const restoreFn = async () => ({ state: new Map(), metadata: {} });
		const state = new LazyThreadState(restoreFn);

		await state.push('messages', { id: 1 });
		await state.push('messages', { id: 2 });

		expect(state.loaded).toBe(false);
		expect(state.dirty).toBe(true);

		const ops = state.getPendingOperations();
		expect(ops).toHaveLength(2);
		expect(ops[0]).toEqual({ op: 'push', key: 'messages', value: { id: 1 } });
		expect(ops[1]).toEqual({ op: 'push', key: 'messages', value: { id: 2 } });
	});

	test('push() creates array when key does not exist (loaded)', async () => {
		const restoreFn = async () => ({ state: new Map(), metadata: {} });
		const state = new LazyThreadState(restoreFn);

		// Trigger load first
		await state.size();

		await state.push('messages', 'first');

		const result = await state.get<string[]>('messages');
		expect(result).toEqual(['first']);
	});

	test('push() appends to existing array (loaded)', async () => {
		const restoreFn = async () => ({ state: new Map([['messages', ['existing']]]), metadata: {} });
		const state = new LazyThreadState(restoreFn);

		// Trigger load first
		await state.size();

		await state.push('messages', 'new');

		const result = await state.get<string[]>('messages');
		expect(result).toEqual(['existing', 'new']);
	});

	test('push() throws error for non-array value (loaded)', async () => {
		const restoreFn = async () => ({ state: new Map([['count', 42]]), metadata: {} });
		const state = new LazyThreadState(restoreFn);

		// Trigger load first
		await state.size();

		expect(() => state.push('count', 'value')).toThrow('Cannot push to non-array value at key "count"');
	});

	test('push() operations applied correctly on load', async () => {
		const restoreFn = async () => ({ state: new Map([['messages', ['msg1']]]), metadata: {} });
		const state = new LazyThreadState(restoreFn);

		await state.push('messages', 'msg2');
		await state.push('messages', 'msg3');
		await state.push('newArray', 'first');

		// Now trigger load - operations should be applied
		const messages = await state.get<string[]>('messages');
		const newArray = await state.get<string[]>('newArray');

		expect(messages).toEqual(['msg1', 'msg2', 'msg3']);
		expect(newArray).toEqual(['first']);
	});

	test('push() with maxRecords limits array size (loaded)', async () => {
		const restoreFn = async () => ({ state: new Map([['messages', ['a', 'b', 'c']]]), metadata: {} });
		const state = new LazyThreadState(restoreFn);

		// Trigger load
		await state.size();

		await state.push('messages', 'd', 3);

		const result = await state.get<string[]>('messages');
		expect(result).toEqual(['b', 'c', 'd']);
	});

	test('push() with maxRecords queued correctly', async () => {
		const restoreFn = async () => ({ state: new Map(), metadata: {} });
		const state = new LazyThreadState(restoreFn);

		await state.push('items', 'a', 2);
		await state.push('items', 'b', 2);
		await state.push('items', 'c', 2);

		const ops = state.getPendingOperations();
		expect(ops).toHaveLength(3);
		expect(ops[0]).toEqual({ op: 'push', key: 'items', value: 'a', maxRecords: 2 });
		expect(ops[1]).toEqual({ op: 'push', key: 'items', value: 'b', maxRecords: 2 });
		expect(ops[2]).toEqual({ op: 'push', key: 'items', value: 'c', maxRecords: 2 });
	});

	test('push() with maxRecords applied on load', async () => {
		const restoreFn = async () => ({ state: new Map([['items', ['existing']]]), metadata: {} });
		const state = new LazyThreadState(restoreFn);

		await state.push('items', 'a', 2);
		await state.push('items', 'b', 2);
		await state.push('items', 'c', 2);

		// Trigger load - should apply operations with maxRecords
		const result = await state.get<string[]>('items');
		expect(result).toEqual(['b', 'c']);
	});
});

describe('DefaultThread', () => {
	const mockProvider = {} as ThreadProvider;

	test('getSaveMode returns none for untouched thread', () => {
		const restoreFn = async () => ({ state: new Map(), metadata: {} });
		const thread = new DefaultThread(mockProvider, 'thrd_test123', restoreFn);

		expect(thread.getSaveMode()).toBe('none');
	});

	test('getSaveMode returns merge for write-only operations', async () => {
		const restoreFn = async () => ({ state: new Map(), metadata: {} });
		const thread = new DefaultThread(mockProvider, 'thrd_test123', restoreFn);

		await thread.state.set('key', 'value');

		expect(thread.getSaveMode()).toBe('merge');
	});

	test('getSaveMode returns full after read and modification', async () => {
		const restoreFn = async () => ({ state: new Map([['existing', 'data']]), metadata: {} });
		const thread = new DefaultThread(mockProvider, 'thrd_test123', restoreFn);

		await thread.state.get('existing');
		await thread.state.set('new', 'value');

		expect(thread.getSaveMode()).toBe('full');
	});

	test('getPendingOperations returns queued operations', async () => {
		const restoreFn = async () => ({ state: new Map(), metadata: {} });
		const thread = new DefaultThread(mockProvider, 'thrd_test123', restoreFn);

		await thread.state.set('key1', 'value1');
		await thread.state.set('key2', 'value2');
		await thread.state.delete('key1');

		const ops = thread.getPendingOperations();

		expect(ops).toHaveLength(3);
		expect(ops[0]).toEqual({ op: 'set', key: 'key1', value: 'value1' });
		expect(ops[1]).toEqual({ op: 'set', key: 'key2', value: 'value2' });
		expect(ops[2]).toEqual({ op: 'delete', key: 'key1' });
	});

	test('getMetadata returns metadata', async () => {
		const restoreFn = async () => ({ state: new Map(), metadata: { userId: 'user123' } });
		const thread = new DefaultThread(mockProvider, 'thrd_test123', restoreFn, { userId: 'user123' });

		const metadata = await thread.getMetadata();
		expect(metadata.userId).toBe('user123');
	});

	test('setMetadata updates metadata', async () => {
		const restoreFn = async () => ({ state: new Map(), metadata: {} });
		const thread = new DefaultThread(mockProvider, 'thrd_test123', restoreFn);

		await thread.setMetadata({ userId: 'user456', role: 'admin' });

		const metadata = await thread.getMetadata();
		expect(metadata.userId).toBe('user456');
		expect(metadata.role).toBe('admin');
	});

	test('empty() returns true for empty thread', async () => {
		const restoreFn = async () => ({ state: new Map(), metadata: {} });
		const thread = new DefaultThread(mockProvider, 'thrd_test123', restoreFn);

		const isEmpty = await thread.empty();
		expect(isEmpty).toBe(true);
	});

	test('empty() returns false when state has data', async () => {
		const restoreFn = async () => ({ state: new Map([['key', 'value']]), metadata: {} });
		const thread = new DefaultThread(mockProvider, 'thrd_test123', restoreFn);

		// Trigger load
		await thread.state.get('key');

		const isEmpty = await thread.empty();
		expect(isEmpty).toBe(false);
	});

	test('getSerializedState returns correct format', async () => {
		const restoreFn = async () => ({ state: new Map([['key', 'value']]), metadata: {} });
		const thread = new DefaultThread(mockProvider, 'thrd_test123', restoreFn);

		await thread.setMetadata({ userId: 'user123' });

		const serialized = await thread.getSerializedState();
		const parsed = JSON.parse(serialized);

		expect(parsed.state).toEqual({ key: 'value' });
		expect(parsed.metadata).toEqual({ userId: 'user123' });
	});
});

describe('Thread round-trip with lazy loading', () => {
	const mockProvider = {} as ThreadProvider;

	test('state persists through serialize/parse cycle', async () => {
		// Create thread and set state
		const restoreFn1 = async () => ({ state: new Map(), metadata: {} });
		const thread1 = new DefaultThread(mockProvider, 'thrd_test123', restoreFn1);

		await thread1.state.set('messages', ['hello', 'world']);
		await thread1.state.set('counter', 42);

		// Serialize (auto-loads state if needed)
		const serialized = await thread1.getSerializedState();
		const { flatStateJson, metadata } = parseThreadData(serialized);

		// Create new thread with restored data
		const restoredState = flatStateJson ? JSON.parse(flatStateJson) : {};
		const restoreFn2 = async () => ({
			state: new Map(Object.entries(restoredState)),
			metadata: metadata || {},
		});
		const thread2 = new DefaultThread(mockProvider, 'thrd_test456', restoreFn2);

		// Verify restored state
		const messages = await thread2.state.get('messages');
		const counter = await thread2.state.get<number>('counter');

		expect(messages).toEqual(['hello', 'world']);
		expect(counter).toBe(42);
	});

	test('metadata persists through serialize/parse cycle', async () => {
		const restoreFn1 = async () => ({ state: new Map(), metadata: {} });
		const thread1 = new DefaultThread(mockProvider, 'thrd_test123', restoreFn1);

		await thread1.setMetadata({ userId: 'user123', tags: ['important'] });

		const serialized = await thread1.getSerializedState();
		const { flatStateJson, metadata } = parseThreadData(serialized);

		const restoredState = flatStateJson ? JSON.parse(flatStateJson) : {};
		const restoreFn2 = async () => ({
			state: new Map(Object.entries(restoredState)),
			metadata: metadata || {},
		});
		const thread2 = new DefaultThread(mockProvider, 'thrd_test456', restoreFn2, metadata);

		const restoredMetadata = await thread2.getMetadata();
		expect(restoredMetadata.userId).toBe('user123');
		expect(restoredMetadata.tags).toEqual(['important']);
	});
});

describe('Backwards compatibility', () => {
	const mockProvider = {} as ThreadProvider;

	test('old format state is correctly restored', async () => {
		const oldFormatJson = JSON.stringify({ messages: ['old', 'format'], counter: 10 });
		const { flatStateJson } = parseThreadData(oldFormatJson);

		const restoredState = flatStateJson ? JSON.parse(flatStateJson) : {};
		const restoreFn = async () => ({
			state: new Map(Object.entries(restoredState)),
			metadata: {},
		});
		const thread = new DefaultThread(mockProvider, 'thrd_test123', restoreFn);

		expect(await thread.state.get('messages')).toEqual(['old', 'format']);
		expect(await thread.state.get('counter')).toBe(10);
	});

	test('old format does not mistakenly populate "state" or "metadata" keys', async () => {
		const oldFormatJson = JSON.stringify({ messages: ['test'], userId: 'user123' });
		const { flatStateJson } = parseThreadData(oldFormatJson);

		const restoredState = flatStateJson ? JSON.parse(flatStateJson) : {};
		const restoreFn = async () => ({
			state: new Map(Object.entries(restoredState)),
			metadata: {},
		});
		const thread = new DefaultThread(mockProvider, 'thrd_test123', restoreFn);

		expect(await thread.state.has('state')).toBe(false);
		expect(await thread.state.has('metadata')).toBe(false);
		expect(await thread.state.get('messages')).toEqual(['test']);
		expect(await thread.state.get('userId')).toBe('user123');
	});
});
