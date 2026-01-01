/**
 * Comprehensive tests for LazyThreadState state machine.
 *
 * State Machine:
 *
 *                     ┌─────────────────────────────────┐
 *                     │                                 │
 *                     ▼                                 │
 * ┌──────┐  write   ┌─────────────────┐  read    ┌─────┴─────┐
 * │ idle │ ───────► │ pending-writes  │ ───────► │  loaded   │
 * └──────┘          └─────────────────┘          └───────────┘
 *     │                                                ▲
 *     │                    read                        │
 *     └────────────────────────────────────────────────┘
 *
 * These tests validate all state transitions and save behavior.
 */

import { test, expect, describe, mock, spyOn } from 'bun:test';
import { DefaultThread, LazyThreadState, type ThreadProvider } from '../src/session';

describe('LazyThreadState State Machine', () => {
	describe('idle state', () => {
		test('initial status is idle', () => {
			const restoreFn = mock(async () => ({ state: new Map(), metadata: {} }));
			const state = new LazyThreadState(restoreFn);

			expect(state.getStatus()).toBe('idle');
			expect(state.loaded).toBe(false);
			expect(state.dirty).toBe(false);
		});

		test('restoreFn is NOT called in idle state', () => {
			const restoreFn = mock(async () => ({ state: new Map(), metadata: {} }));
			new LazyThreadState(restoreFn);

			expect(restoreFn).not.toHaveBeenCalled();
		});

		test('idle → loaded on get()', async () => {
			const restoreFn = mock(async () => ({ state: new Map([['key', 'value']]), metadata: {} }));
			const state = new LazyThreadState(restoreFn);

			await state.get('key');

			expect(state.getStatus()).toBe('loaded');
			expect(state.loaded).toBe(true);
			expect(restoreFn).toHaveBeenCalledTimes(1);
		});

		test('idle → loaded on has()', async () => {
			const restoreFn = mock(async () => ({ state: new Map(), metadata: {} }));
			const state = new LazyThreadState(restoreFn);

			await state.has('key');

			expect(state.getStatus()).toBe('loaded');
			expect(restoreFn).toHaveBeenCalledTimes(1);
		});

		test('idle → loaded on entries()', async () => {
			const restoreFn = mock(async () => ({ state: new Map([['a', 1]]), metadata: {} }));
			const state = new LazyThreadState(restoreFn);

			await state.entries();

			expect(state.getStatus()).toBe('loaded');
			expect(restoreFn).toHaveBeenCalledTimes(1);
		});

		test('idle → loaded on keys()', async () => {
			const restoreFn = mock(async () => ({ state: new Map(), metadata: {} }));
			const state = new LazyThreadState(restoreFn);

			await state.keys();

			expect(state.getStatus()).toBe('loaded');
			expect(restoreFn).toHaveBeenCalledTimes(1);
		});

		test('idle → loaded on values()', async () => {
			const restoreFn = mock(async () => ({ state: new Map(), metadata: {} }));
			const state = new LazyThreadState(restoreFn);

			await state.values();

			expect(state.getStatus()).toBe('loaded');
			expect(restoreFn).toHaveBeenCalledTimes(1);
		});

		test('idle → loaded on size()', async () => {
			const restoreFn = mock(async () => ({ state: new Map(), metadata: {} }));
			const state = new LazyThreadState(restoreFn);

			await state.size();

			expect(state.getStatus()).toBe('loaded');
			expect(restoreFn).toHaveBeenCalledTimes(1);
		});

		test('idle → pending-writes on set()', async () => {
			const restoreFn = mock(async () => ({ state: new Map(), metadata: {} }));
			const state = new LazyThreadState(restoreFn);

			await state.set('key', 'value');

			expect(state.getStatus()).toBe('pending-writes');
			expect(state.loaded).toBe(false);
			expect(state.dirty).toBe(true);
			expect(restoreFn).not.toHaveBeenCalled();
		});

		test('idle → pending-writes on delete()', async () => {
			const restoreFn = mock(async () => ({ state: new Map(), metadata: {} }));
			const state = new LazyThreadState(restoreFn);

			await state.delete('key');

			expect(state.getStatus()).toBe('pending-writes');
			expect(restoreFn).not.toHaveBeenCalled();
		});

		test('idle → pending-writes on clear()', async () => {
			const restoreFn = mock(async () => ({ state: new Map(), metadata: {} }));
			const state = new LazyThreadState(restoreFn);

			await state.clear();

			expect(state.getStatus()).toBe('pending-writes');
			expect(restoreFn).not.toHaveBeenCalled();
		});

		test('idle → pending-writes on push()', async () => {
			const restoreFn = mock(async () => ({ state: new Map(), metadata: {} }));
			const state = new LazyThreadState(restoreFn);

			await state.push('arr', 'item');

			expect(state.getStatus()).toBe('pending-writes');
			expect(restoreFn).not.toHaveBeenCalled();
		});
	});

	describe('pending-writes state', () => {
		test('pending-writes stays on additional set()', async () => {
			const restoreFn = mock(async () => ({ state: new Map(), metadata: {} }));
			const state = new LazyThreadState(restoreFn);

			await state.set('key1', 'value1');
			expect(state.getStatus()).toBe('pending-writes');

			await state.set('key2', 'value2');
			expect(state.getStatus()).toBe('pending-writes');

			await state.set('key3', 'value3');
			expect(state.getStatus()).toBe('pending-writes');

			expect(restoreFn).not.toHaveBeenCalled();
			expect(state.getPendingOperations()).toHaveLength(3);
		});

		test('pending-writes stays on delete()', async () => {
			const restoreFn = mock(async () => ({ state: new Map(), metadata: {} }));
			const state = new LazyThreadState(restoreFn);

			await state.set('key', 'value');
			await state.delete('key');

			expect(state.getStatus()).toBe('pending-writes');
			expect(restoreFn).not.toHaveBeenCalled();
		});

		test('pending-writes stays on clear()', async () => {
			const restoreFn = mock(async () => ({ state: new Map(), metadata: {} }));
			const state = new LazyThreadState(restoreFn);

			await state.set('key', 'value');
			await state.clear();

			expect(state.getStatus()).toBe('pending-writes');
			expect(restoreFn).not.toHaveBeenCalled();
		});

		test('pending-writes stays on push()', async () => {
			const restoreFn = mock(async () => ({ state: new Map(), metadata: {} }));
			const state = new LazyThreadState(restoreFn);

			await state.set('key', 'value');
			await state.push('arr', 'item');

			expect(state.getStatus()).toBe('pending-writes');
			expect(restoreFn).not.toHaveBeenCalled();
		});

		test('pending-writes → loaded on get()', async () => {
			const restoreFn = mock(async () => ({ state: new Map([['existing', 'data']]), metadata: {} }));
			const state = new LazyThreadState(restoreFn);

			await state.set('new', 'value');
			expect(state.getStatus()).toBe('pending-writes');

			const result = await state.get('new');

			expect(state.getStatus()).toBe('loaded');
			expect(result).toBe('value');
			expect(restoreFn).toHaveBeenCalledTimes(1);
		});

		test('pending-writes → loaded on has()', async () => {
			const restoreFn = mock(async () => ({ state: new Map(), metadata: {} }));
			const state = new LazyThreadState(restoreFn);

			await state.set('key', 'value');
			await state.has('key');

			expect(state.getStatus()).toBe('loaded');
			expect(restoreFn).toHaveBeenCalledTimes(1);
		});

		test('pending-writes → loaded on entries()', async () => {
			const restoreFn = mock(async () => ({ state: new Map(), metadata: {} }));
			const state = new LazyThreadState(restoreFn);

			await state.set('key', 'value');
			await state.entries();

			expect(state.getStatus()).toBe('loaded');
		});

		test('pending-writes → loaded on keys()', async () => {
			const restoreFn = mock(async () => ({ state: new Map(), metadata: {} }));
			const state = new LazyThreadState(restoreFn);

			await state.set('key', 'value');
			await state.keys();

			expect(state.getStatus()).toBe('loaded');
		});

		test('pending-writes → loaded on values()', async () => {
			const restoreFn = mock(async () => ({ state: new Map(), metadata: {} }));
			const state = new LazyThreadState(restoreFn);

			await state.set('key', 'value');
			await state.values();

			expect(state.getStatus()).toBe('loaded');
		});

		test('pending-writes → loaded on size()', async () => {
			const restoreFn = mock(async () => ({ state: new Map(), metadata: {} }));
			const state = new LazyThreadState(restoreFn);

			await state.set('key', 'value');
			await state.size();

			expect(state.getStatus()).toBe('loaded');
		});

		test('pending operations are applied after load', async () => {
			const restoreFn = mock(async () => ({
				state: new Map([
					['existing', 'original'],
					['toDelete', 'gone'],
				]),
				metadata: {},
			}));
			const state = new LazyThreadState(restoreFn);

			await state.set('new', 'value');
			await state.set('existing', 'modified');
			await state.delete('toDelete');

			const newVal = await state.get('new');
			const existingVal = await state.get('existing');
			const deletedVal = await state.get('toDelete');

			expect(newVal).toBe('value');
			expect(existingVal).toBe('modified');
			expect(deletedVal).toBeUndefined();
		});

		test('clear operation clears previous pending ops and existing data', async () => {
			const restoreFn = mock(async () => ({
				state: new Map([['existing', 'data']]),
				metadata: {},
			}));
			const state = new LazyThreadState(restoreFn);

			await state.set('key1', 'value1');
			await state.set('key2', 'value2');
			await state.clear();
			await state.set('afterClear', 'only');

			const ops = state.getPendingOperations();
			expect(ops).toHaveLength(2);
			expect(ops[0]).toEqual({ op: 'clear' });
			expect(ops[1]).toEqual({ op: 'set', key: 'afterClear', value: 'only' });

			const keys = await state.keys();
			expect(keys).toEqual(['afterClear']);
		});

		test('pending operations are cleared after load', async () => {
			const restoreFn = mock(async () => ({ state: new Map(), metadata: {} }));
			const state = new LazyThreadState(restoreFn);

			await state.set('key', 'value');
			expect(state.getPendingOperations()).toHaveLength(1);

			await state.get('key');
			expect(state.getPendingOperations()).toHaveLength(0);
		});
	});

	describe('loaded state', () => {
		test('loaded stays loaded on all operations', async () => {
			const restoreFn = mock(async () => ({ state: new Map([['initial', 'data']]), metadata: {} }));
			const state = new LazyThreadState(restoreFn);

			await state.get('initial');
			expect(state.getStatus()).toBe('loaded');

			await state.set('new', 'value');
			expect(state.getStatus()).toBe('loaded');

			await state.delete('new');
			expect(state.getStatus()).toBe('loaded');

			await state.has('initial');
			expect(state.getStatus()).toBe('loaded');

			await state.entries();
			expect(state.getStatus()).toBe('loaded');

			await state.keys();
			expect(state.getStatus()).toBe('loaded');

			await state.values();
			expect(state.getStatus()).toBe('loaded');

			await state.size();
			expect(state.getStatus()).toBe('loaded');

			expect(restoreFn).toHaveBeenCalledTimes(1);
		});

		test('set() modifies local cache when loaded', async () => {
			const restoreFn = mock(async () => ({ state: new Map(), metadata: {} }));
			const state = new LazyThreadState(restoreFn);

			await state.size();
			await state.set('key', 'value');

			expect(state.getPendingOperations()).toHaveLength(0);
			expect(await state.get('key')).toBe('value');
		});

		test('delete() modifies local cache when loaded', async () => {
			const restoreFn = mock(async () => ({ state: new Map([['key', 'value']]), metadata: {} }));
			const state = new LazyThreadState(restoreFn);

			await state.size();
			await state.delete('key');

			expect(state.getPendingOperations()).toHaveLength(0);
			expect(await state.has('key')).toBe(false);
		});

		test('clear() modifies local cache when loaded', async () => {
			const restoreFn = mock(async () => ({
				state: new Map([
					['a', 1],
					['b', 2],
				]),
				metadata: {},
			}));
			const state = new LazyThreadState(restoreFn);

			await state.size();
			await state.clear();

			expect(state.getPendingOperations()).toHaveLength(0);
			expect(await state.size()).toBe(0);
		});

		test('push() modifies local cache when loaded', async () => {
			const restoreFn = mock(async () => ({ state: new Map([['arr', ['a', 'b']]]), metadata: {} }));
			const state = new LazyThreadState(restoreFn);

			await state.size();
			await state.push('arr', 'c');

			expect(state.getPendingOperations()).toHaveLength(0);
			expect(await state.get('arr')).toEqual(['a', 'b', 'c']);
		});

		test('dirty is false when no changes after load', async () => {
			const restoreFn = mock(async () => ({ state: new Map([['key', 'value']]), metadata: {} }));
			const state = new LazyThreadState(restoreFn);

			await state.get('key');

			expect(state.dirty).toBe(false);
		});

		test('dirty is true when state modified after load', async () => {
			const restoreFn = mock(async () => ({ state: new Map([['key', 'value']]), metadata: {} }));
			const state = new LazyThreadState(restoreFn);

			await state.get('key');
			await state.set('newKey', 'newValue');

			expect(state.dirty).toBe(true);
		});

		test('dirty returns to false if changes reverted', async () => {
			const restoreFn = mock(async () => ({ state: new Map([['key', 'value']]), metadata: {} }));
			const state = new LazyThreadState(restoreFn);

			await state.get('key');
			await state.set('key', 'changed');
			expect(state.dirty).toBe(true);

			await state.set('key', 'value');
			expect(state.dirty).toBe(false);
		});
	});

	describe('dirty property', () => {
		test('idle state: dirty is false', () => {
			const restoreFn = mock(async () => ({ state: new Map(), metadata: {} }));
			const state = new LazyThreadState(restoreFn);

			expect(state.dirty).toBe(false);
		});

		test('pending-writes state: dirty is true when operations queued', async () => {
			const restoreFn = mock(async () => ({ state: new Map(), metadata: {} }));
			const state = new LazyThreadState(restoreFn);

			await state.set('key', 'value');

			expect(state.dirty).toBe(true);
		});

		test('pending-writes state after clear: dirty is true', async () => {
			const restoreFn = mock(async () => ({ state: new Map(), metadata: {} }));
			const state = new LazyThreadState(restoreFn);

			await state.clear();

			expect(state.dirty).toBe(true);
			expect(state.getPendingOperations()).toHaveLength(1);
		});

		test('loaded state: dirty based on comparison', async () => {
			const restoreFn = mock(async () => ({
				state: new Map([
					['a', 1],
					['b', 2],
				]),
				metadata: {},
			}));
			const state = new LazyThreadState(restoreFn);

			await state.size();
			expect(state.dirty).toBe(false);

			await state.set('c', 3);
			expect(state.dirty).toBe(true);

			await state.delete('c');
			expect(state.dirty).toBe(false);
		});
	});
});

describe('LazyThreadState Concurrent Access', () => {
	test('multiple concurrent reads use same load promise', async () => {
		let loadCount = 0;
		const restoreFn = mock(async () => {
			loadCount++;
			await new Promise((resolve) => setTimeout(resolve, 10));
			return { state: new Map([['key', 'value']]), metadata: {} };
		});
		const state = new LazyThreadState(restoreFn);

		const [r1, r2, r3] = await Promise.all([state.get('key'), state.has('key'), state.size()]);

		expect(loadCount).toBe(1);
		expect(restoreFn).toHaveBeenCalledTimes(1);
		expect(r1).toBe('value');
		expect(r2).toBe(true);
		expect(r3).toBe(1);
	});

	test('concurrent writes while loading are queued correctly', async () => {
		let loadStarted = false;
		let loadResolver: () => void;
		const loadPromise = new Promise<void>((resolve) => {
			loadResolver = resolve;
		});

		const restoreFn = mock(async () => {
			loadStarted = true;
			await loadPromise;
			return { state: new Map([['existing', 'data']]), metadata: {} };
		});
		const state = new LazyThreadState(restoreFn);

		const readPromise = state.get('existing');

		await new Promise((r) => setTimeout(r, 5));
		expect(loadStarted).toBe(true);
		expect(state.getStatus()).not.toBe('loaded');

		loadResolver!();

		const result = await readPromise;
		expect(result).toBe('data');
		expect(state.getStatus()).toBe('loaded');
	});

	test('write during pending load transitions correctly', async () => {
		let loadResolver: () => void;
		const loadPromise = new Promise<void>((resolve) => {
			loadResolver = resolve;
		});

		const restoreFn = mock(async () => {
			await loadPromise;
			return { state: new Map([['existing', 'data']]), metadata: {} };
		});
		const state = new LazyThreadState(restoreFn);

		const readPromise = state.get('key');

		await state.set('newKey', 'newValue');

		loadResolver!();
		await readPromise;

		expect(state.getStatus()).toBe('loaded');
		expect(await state.get('newKey')).toBe('newValue');
	});
});

describe('LazyThreadState Error Handling', () => {
	test('restoreFn error propagates to caller', async () => {
		const restoreFn = mock(async () => {
			throw new Error('Database connection failed');
		});
		const state = new LazyThreadState(restoreFn);

		await expect(state.get('key')).rejects.toThrow('Database connection failed');
	});

	test('restoreFn error on concurrent reads propagates to all', async () => {
		const restoreFn = mock(async () => {
			await new Promise((resolve) => setTimeout(resolve, 5));
			throw new Error('Load failed');
		});
		const state = new LazyThreadState(restoreFn);

		const results = await Promise.allSettled([state.get('a'), state.has('b'), state.size()]);

		expect(results[0].status).toBe('rejected');
		expect(results[1].status).toBe('rejected');
		expect(results[2].status).toBe('rejected');
	});

	test('retry succeeds after restoreFn failure (promise not poisoned)', async () => {
		let callCount = 0;
		const restoreFn = mock(async () => {
			callCount++;
			if (callCount === 1) {
				throw new Error('First attempt failed');
			}
			return { state: new Map([['key', 'value']]), metadata: {} };
		});
		const state = new LazyThreadState(restoreFn);

		await expect(state.get('key')).rejects.toThrow('First attempt failed');

		const result = await state.get('key');
		expect(result).toBe('value');
		expect(callCount).toBe(2);
	});

	test('pending writes are not lost after failed load', async () => {
		let callCount = 0;
		const restoreFn = mock(async () => {
			callCount++;
			if (callCount === 1) {
				throw new Error('First attempt failed');
			}
			return { state: new Map([['existing', 'data']]), metadata: {} };
		});
		const state = new LazyThreadState(restoreFn);

		await state.set('newKey', 'newValue');

		await expect(state.get('anything')).rejects.toThrow('First attempt failed');

		expect(state.getStatus()).toBe('pending-writes');
		expect(state.getPendingOperations()).toHaveLength(1);

		const result = await state.get('newKey');
		expect(result).toBe('newValue');
	});

	test('push to non-array throws when loaded', async () => {
		const restoreFn = mock(async () => ({
			state: new Map([['count', 42]]),
			metadata: {},
		}));
		const state = new LazyThreadState(restoreFn);

		await state.size();

		expect(() => state.push('count', 'item')).toThrow('Cannot push to non-array value at key "count"');
	});
});

describe('LazyThreadState getSerializedState', () => {
	test('returns correct data when idle (triggers load)', async () => {
		const restoreFn = mock(async () => ({
			state: new Map([
				['a', 1],
				['b', 2],
			]),
			metadata: {},
		}));
		const state = new LazyThreadState(restoreFn);

		const serialized = await state.getSerializedState();

		expect(serialized).toEqual({ a: 1, b: 2 });
		expect(state.getStatus()).toBe('loaded');
	});

	test('returns correct data with pending writes applied', async () => {
		const restoreFn = mock(async () => ({
			state: new Map([['existing', 'original']]),
			metadata: {},
		}));
		const state = new LazyThreadState(restoreFn);

		await state.set('new', 'value');
		await state.set('existing', 'modified');

		const serialized = await state.getSerializedState();

		expect(serialized).toEqual({ existing: 'modified', new: 'value' });
	});

	test('returns correct data when already loaded', async () => {
		const restoreFn = mock(async () => ({
			state: new Map([['key', 'value']]),
			metadata: {},
		}));
		const state = new LazyThreadState(restoreFn);

		await state.get('key');
		await state.set('another', 'data');

		const serialized = await state.getSerializedState();

		expect(serialized).toEqual({ key: 'value', another: 'data' });
		expect(restoreFn).toHaveBeenCalledTimes(1);
	});
});

describe('DefaultThread Save Modes', () => {
	const mockProvider = {} as ThreadProvider;

	describe('getSaveMode', () => {
		test('returns "none" for untouched thread (idle state)', () => {
			const restoreFn = async () => ({ state: new Map(), metadata: {} });
			const thread = new DefaultThread(mockProvider, 'thrd_test', restoreFn);

			expect(thread.getSaveMode()).toBe('none');
		});

		test('returns "merge" for pending-writes state', async () => {
			const restoreFn = async () => ({ state: new Map(), metadata: {} });
			const thread = new DefaultThread(mockProvider, 'thrd_test', restoreFn);

			await thread.state.set('key', 'value');

			expect(thread.getSaveMode()).toBe('merge');
		});

		test('returns "none" for loaded but clean state', async () => {
			const restoreFn = async () => ({ state: new Map([['key', 'value']]), metadata: {} });
			const thread = new DefaultThread(mockProvider, 'thrd_test', restoreFn);

			await thread.state.get('key');

			expect(thread.getSaveMode()).toBe('none');
		});

		test('returns "full" for loaded and dirty state', async () => {
			const restoreFn = async () => ({ state: new Map([['key', 'value']]), metadata: {} });
			const thread = new DefaultThread(mockProvider, 'thrd_test', restoreFn);

			await thread.state.get('key');
			await thread.state.set('newKey', 'newValue');

			expect(thread.getSaveMode()).toBe('full');
		});

		test('returns "merge" when only metadata changed (idle state)', async () => {
			const restoreFn = async () => ({ state: new Map(), metadata: {} });
			const thread = new DefaultThread(mockProvider, 'thrd_test', restoreFn);

			await thread.setMetadata({ userId: 'user123' });

			expect(thread.getSaveMode()).toBe('merge');
		});

		test('returns "full" when metadata changed after load', async () => {
			const restoreFn = async () => ({ state: new Map([['key', 'value']]), metadata: { old: 'meta' } });
			const thread = new DefaultThread(mockProvider, 'thrd_test', restoreFn, { old: 'meta' });

			await thread.state.get('key');
			await thread.setMetadata({ userId: 'user123' });

			expect(thread.getSaveMode()).toBe('full');
		});

		test('returns "full" when metadata changed after state loaded (even if state unchanged)', async () => {
			const restoreFn = async () => ({ state: new Map([['key', 'value']]), metadata: {} });
			const thread = new DefaultThread(mockProvider, 'thrd_test', restoreFn);

			await thread.state.get('key');
			expect(thread.getSaveMode()).toBe('none');

			await thread.setMetadata({ userId: 'user123' });
			expect(thread.getSaveMode()).toBe('full');
		});

		test('returns "none" after read-only access (state + metadata)', async () => {
			const restoreFn = async () => ({
				state: new Map([['key', 'value']]),
				metadata: { existing: 'meta' },
			});
			const thread = new DefaultThread(mockProvider, 'thrd_test', restoreFn, { existing: 'meta' });

			await thread.state.get('key');
			await thread.getMetadata();

			expect(thread.getSaveMode()).toBe('none');
		});
	});

	describe('getPendingOperations', () => {
		test('returns empty array for idle state', () => {
			const restoreFn = async () => ({ state: new Map(), metadata: {} });
			const thread = new DefaultThread(mockProvider, 'thrd_test', restoreFn);

			expect(thread.getPendingOperations()).toEqual([]);
		});

		test('returns queued operations for pending-writes state', async () => {
			const restoreFn = async () => ({ state: new Map(), metadata: {} });
			const thread = new DefaultThread(mockProvider, 'thrd_test', restoreFn);

			await thread.state.set('key1', 'value1');
			await thread.state.delete('key2');
			await thread.state.push('arr', 'item', 10);

			const ops = thread.getPendingOperations();

			expect(ops).toHaveLength(3);
			expect(ops[0]).toEqual({ op: 'set', key: 'key1', value: 'value1' });
			expect(ops[1]).toEqual({ op: 'delete', key: 'key2' });
			expect(ops[2]).toEqual({ op: 'push', key: 'arr', value: 'item', maxRecords: 10 });
		});

		test('returns empty array for loaded state', async () => {
			const restoreFn = async () => ({ state: new Map(), metadata: {} });
			const thread = new DefaultThread(mockProvider, 'thrd_test', restoreFn);

			await thread.state.size();
			await thread.state.set('key', 'value');

			expect(thread.getPendingOperations()).toEqual([]);
		});
	});

	describe('getSerializedState', () => {
		test('includes both state and metadata', async () => {
			const restoreFn = async () => ({ state: new Map([['key', 'value']]), metadata: {} });
			const thread = new DefaultThread(mockProvider, 'thrd_test', restoreFn);

			await thread.setMetadata({ userId: 'user123' });

			const serialized = await thread.getSerializedState();
			const parsed = JSON.parse(serialized);

			expect(parsed.state).toEqual({ key: 'value' });
			expect(parsed.metadata).toEqual({ userId: 'user123' });
		});

		test('excludes metadata if not set', async () => {
			const restoreFn = async () => ({ state: new Map([['key', 'value']]), metadata: {} });
			const thread = new DefaultThread(mockProvider, 'thrd_test', restoreFn);

			const serialized = await thread.getSerializedState();
			const parsed = JSON.parse(serialized);

			expect(parsed.state).toEqual({ key: 'value' });
			expect(parsed.metadata).toBeUndefined();
		});
	});
});

describe('Pending Operations Application Order', () => {
	test('operations applied in exact order', async () => {
		const restoreFn = mock(async () => ({ state: new Map(), metadata: {} }));
		const state = new LazyThreadState(restoreFn);

		await state.set('key', 'first');
		await state.set('key', 'second');
		await state.set('key', 'third');

		const result = await state.get('key');
		expect(result).toBe('third');
	});

	test('delete after set removes the value', async () => {
		const restoreFn = mock(async () => ({ state: new Map(), metadata: {} }));
		const state = new LazyThreadState(restoreFn);

		await state.set('key', 'value');
		await state.delete('key');

		const result = await state.get('key');
		expect(result).toBeUndefined();
	});

	test('set after delete adds value back', async () => {
		const restoreFn = mock(async () => ({
			state: new Map([['key', 'original']]),
			metadata: {},
		}));
		const state = new LazyThreadState(restoreFn);

		await state.delete('key');
		await state.set('key', 'restored');

		const result = await state.get('key');
		expect(result).toBe('restored');
	});

	test('clear followed by sets only keeps sets after clear', async () => {
		const restoreFn = mock(async () => ({
			state: new Map([
				['existing1', 'a'],
				['existing2', 'b'],
			]),
			metadata: {},
		}));
		const state = new LazyThreadState(restoreFn);

		await state.set('beforeClear', 'value');
		await state.clear();
		await state.set('afterClear', 'value');

		const entries = await state.entries();
		expect(entries).toEqual([['afterClear', 'value']]);
	});

	test('push operations accumulate correctly', async () => {
		const restoreFn = mock(async () => ({
			state: new Map([['messages', ['existing']]]),
			metadata: {},
		}));
		const state = new LazyThreadState(restoreFn);

		await state.push('messages', 'msg1');
		await state.push('messages', 'msg2');
		await state.push('messages', 'msg3');

		const result = await state.get<string[]>('messages');
		expect(result).toEqual(['existing', 'msg1', 'msg2', 'msg3']);
	});

	test('push with maxRecords trims correctly on load', async () => {
		const restoreFn = mock(async () => ({
			state: new Map([['items', ['a', 'b', 'c']]]),
			metadata: {},
		}));
		const state = new LazyThreadState(restoreFn);

		await state.push('items', 'd', 3);
		await state.push('items', 'e', 3);

		const result = await state.get<string[]>('items');
		expect(result).toEqual(['c', 'd', 'e']);
	});

	test('push to non-existent key creates array on load', async () => {
		const restoreFn = mock(async () => ({ state: new Map(), metadata: {} }));
		const state = new LazyThreadState(restoreFn);

		await state.push('newArray', 'first');
		await state.push('newArray', 'second');

		const result = await state.get<string[]>('newArray');
		expect(result).toEqual(['first', 'second']);
	});

	test('push to non-array value is silently skipped on load', async () => {
		const restoreFn = mock(async () => ({
			state: new Map([['count', 42]]),
			metadata: {},
		}));
		const state = new LazyThreadState(restoreFn);

		await state.push('count', 'ignored');

		const result = await state.get('count');
		expect(result).toBe(42);
	});
});

describe('DefaultThread Metadata Error Handling', () => {
	const mockProvider = {} as ThreadProvider;

	test('metadata retry succeeds after restoreFn failure', async () => {
		let callCount = 0;
		const restoreFn = mock(async () => {
			callCount++;
			if (callCount === 1) {
				throw new Error('First attempt failed');
			}
			return { state: new Map(), metadata: { userId: 'user123' } };
		});
		const thread = new DefaultThread(mockProvider, 'thrd_test', restoreFn);

		await expect(thread.getMetadata()).rejects.toThrow('First attempt failed');

		const metadata = await thread.getMetadata();
		expect(metadata.userId).toBe('user123');
		expect(callCount).toBe(2);
	});

	test('setMetadata does not require load', async () => {
		const restoreFn = mock(async () => ({ state: new Map(), metadata: { existing: 'data' } }));
		const thread = new DefaultThread(mockProvider, 'thrd_test', restoreFn);

		await thread.setMetadata({ newKey: 'newValue' });

		expect(restoreFn).not.toHaveBeenCalled();

		const metadata = await thread.getMetadata();
		expect(metadata.newKey).toBe('newValue');
		expect(metadata.existing).toBeUndefined();
	});
});

describe('DefaultThread Double Restore Behavior', () => {
	const mockProvider = {} as ThreadProvider;

	test('state and metadata each trigger independent restoreFn calls', async () => {
		let callCount = 0;
		const restoreFn = mock(async () => {
			callCount++;
			return { state: new Map([['key', 'value']]), metadata: { userId: 'user123' } };
		});
		const thread = new DefaultThread(mockProvider, 'thrd_test', restoreFn);

		await thread.state.get('key');
		expect(callCount).toBe(1);

		await thread.getMetadata();
		expect(callCount).toBe(2);
	});

	test('initialMetadata optimization avoids restoreFn call for metadata', async () => {
		let callCount = 0;
		const restoreFn = mock(async () => {
			callCount++;
			return { state: new Map([['key', 'value']]), metadata: { fromRestore: true } };
		});
		const thread = new DefaultThread(mockProvider, 'thrd_test', restoreFn, { initial: 'metadata' });

		const metadata = await thread.getMetadata();
		expect(metadata.initial).toBe('metadata');
		expect(callCount).toBe(0);

		await thread.state.get('key');
		expect(callCount).toBe(1);
	});
});

describe('Edge Cases', () => {
	test('empty restoreFn response handled correctly', async () => {
		const restoreFn = mock(async () => ({ state: new Map(), metadata: {} }));
		const state = new LazyThreadState(restoreFn);

		expect(await state.size()).toBe(0);
		expect(await state.entries()).toEqual([]);
		expect(await state.keys()).toEqual([]);
		expect(await state.values()).toEqual([]);
	});

	test('undefined and null values preserved', async () => {
		const restoreFn = mock(async () => ({
			state: new Map([
				['nullVal', null],
				['undefinedVal', undefined],
			]),
			metadata: {},
		}));
		const state = new LazyThreadState(restoreFn);

		expect(await state.get('nullVal')).toBeNull();
		expect(await state.get('undefinedVal')).toBeUndefined();
		expect(await state.has('nullVal')).toBe(true);
		expect(await state.has('undefinedVal')).toBe(true);
	});

	test('complex nested objects preserved', async () => {
		const complexValue = {
			arr: [1, 2, { nested: true }],
			obj: { deep: { value: 'test' } },
			date: '2024-01-01',
		};

		const restoreFn = mock(async () => ({
			state: new Map([['complex', complexValue]]),
			metadata: {},
		}));
		const state = new LazyThreadState(restoreFn);

		const result = await state.get('complex');
		expect(result).toEqual(complexValue);
	});

	test('very large state handled', async () => {
		const largeState = new Map<string, unknown>();
		for (let i = 0; i < 1000; i++) {
			largeState.set(`key${i}`, { index: i, data: 'x'.repeat(100) });
		}

		const restoreFn = mock(async () => ({ state: largeState, metadata: {} }));
		const state = new LazyThreadState(restoreFn);

		expect(await state.size()).toBe(1000);
		expect(await state.get('key500')).toEqual({ index: 500, data: 'x'.repeat(100) });
	});

	test('special characters in keys handled', async () => {
		const restoreFn = mock(async () => ({ state: new Map(), metadata: {} }));
		const state = new LazyThreadState(restoreFn);

		await state.set('key.with.dots', 'value1');
		await state.set('key/with/slashes', 'value2');
		await state.set('key with spaces', 'value3');
		await state.set('key:with:colons', 'value4');
		await state.set('emoji🎉key', 'value5');

		const keys = await state.keys();
		expect(keys).toContain('key.with.dots');
		expect(keys).toContain('key/with/slashes');
		expect(keys).toContain('key with spaces');
		expect(keys).toContain('key:with:colons');
		expect(keys).toContain('emoji🎉key');
	});
});
