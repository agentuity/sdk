/**
 * Tests for thread state persistence.
 * Validates that thread state is correctly serialized, saved, and restored.
 */

import { test, expect, describe } from 'bun:test';
import { DefaultThread, parseThreadData, type ThreadProvider } from '../src/session';

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

describe('DefaultThread isDirty', () => {
	test('returns false for empty new thread', () => {
		const mockProvider = {} as ThreadProvider;
		const thread = new DefaultThread(mockProvider, 'thrd_test123');

		expect(thread.isDirty()).toBe(false);
	});

	test('returns true after setting state on new thread', () => {
		const mockProvider = {} as ThreadProvider;
		const thread = new DefaultThread(mockProvider, 'thrd_test123');

		thread.state.set('messages', ['hello']);

		expect(thread.isDirty()).toBe(true);
	});

	test('returns false when state matches initialStateJson', () => {
		const mockProvider = {} as ThreadProvider;
		const initialState = { messages: ['hello'] };
		const thread = new DefaultThread(mockProvider, 'thrd_test123', JSON.stringify(initialState));

		thread.state.set('messages', ['hello']);

		expect(thread.isDirty()).toBe(false);
	});

	test('returns true when state differs from initialStateJson', () => {
		const mockProvider = {} as ThreadProvider;
		const initialState = { messages: ['hello'] };
		const thread = new DefaultThread(mockProvider, 'thrd_test123', JSON.stringify(initialState));

		thread.state.set('messages', ['hello']);
		thread.state.set('messages', ['hello', 'world']);

		expect(thread.isDirty()).toBe(true);
	});

	test('returns true when adding new key to existing state', () => {
		const mockProvider = {} as ThreadProvider;
		const initialState = { messages: ['hello'] };
		const thread = new DefaultThread(mockProvider, 'thrd_test123', JSON.stringify(initialState));

		thread.state.set('messages', ['hello']);
		thread.state.set('counter', 1);

		expect(thread.isDirty()).toBe(true);
	});

	test('returns true when removing key from existing state', () => {
		const mockProvider = {} as ThreadProvider;
		const initialState = { messages: ['hello'], counter: 1 };
		const thread = new DefaultThread(mockProvider, 'thrd_test123', JSON.stringify(initialState));

		thread.state.set('messages', ['hello']);
		thread.state.set('counter', 1);
		thread.state.delete('counter');

		expect(thread.isDirty()).toBe(true);
	});
});

describe('DefaultThread getSerializedState', () => {
	test('returns empty string for empty thread', () => {
		const mockProvider = {} as ThreadProvider;
		const thread = new DefaultThread(mockProvider, 'thrd_test123');

		expect(thread.getSerializedState()).toBe('');
	});

	test('returns envelope with state only when no metadata', () => {
		const mockProvider = {} as ThreadProvider;
		const thread = new DefaultThread(mockProvider, 'thrd_test123');

		thread.state.set('messages', ['hello']);

		const serialized = thread.getSerializedState();
		const parsed = JSON.parse(serialized);

		expect(parsed.state).toEqual({ messages: ['hello'] });
		expect(parsed.metadata).toBeUndefined();
	});

	test('returns envelope with metadata only when no state', () => {
		const mockProvider = {} as ThreadProvider;
		const thread = new DefaultThread(mockProvider, 'thrd_test123');

		thread.metadata.userId = 'user123';

		const serialized = thread.getSerializedState();
		const parsed = JSON.parse(serialized);

		expect(parsed.state).toBeUndefined();
		expect(parsed.metadata).toEqual({ userId: 'user123' });
	});

	test('returns envelope with both state and metadata', () => {
		const mockProvider = {} as ThreadProvider;
		const thread = new DefaultThread(mockProvider, 'thrd_test123');

		thread.state.set('messages', ['hello']);
		thread.metadata.userId = 'user123';

		const serialized = thread.getSerializedState();
		const parsed = JSON.parse(serialized);

		expect(parsed.state).toEqual({ messages: ['hello'] });
		expect(parsed.metadata).toEqual({ userId: 'user123' });
	});

	test('handles complex nested state', () => {
		const mockProvider = {} as ThreadProvider;
		const thread = new DefaultThread(mockProvider, 'thrd_test123');

		thread.state.set('messages', [
			{ id: '1', content: 'hello', timestamp: '2024-01-01' },
			{ id: '2', content: 'world', timestamp: '2024-01-02' },
		]);
		thread.state.set('config', { nested: { deeply: { value: 42 } } });

		const serialized = thread.getSerializedState();
		const parsed = JSON.parse(serialized);

		expect(parsed.state.messages).toHaveLength(2);
		expect(parsed.state.messages[0].content).toBe('hello');
		expect(parsed.state.config.nested.deeply.value).toBe(42);
	});
});

describe('Thread state round-trip', () => {
	test('serialize then parse preserves state', () => {
		const mockProvider = {} as ThreadProvider;
		const thread = new DefaultThread(mockProvider, 'thrd_test123');

		thread.state.set('messages', ['hello', 'world']);
		thread.state.set('counter', 42);

		const serialized = thread.getSerializedState();
		const { flatStateJson } = parseThreadData(serialized);

		expect(flatStateJson).toBeDefined();
		const restored = JSON.parse(flatStateJson!);

		expect(restored.messages).toEqual(['hello', 'world']);
		expect(restored.counter).toBe(42);
	});

	test('serialize then parse preserves metadata', () => {
		const mockProvider = {} as ThreadProvider;
		const thread = new DefaultThread(mockProvider, 'thrd_test123');

		thread.metadata.userId = 'user123';
		thread.metadata.tags = ['important', 'urgent'];

		const serialized = thread.getSerializedState();
		const { metadata } = parseThreadData(serialized);

		expect(metadata).toBeDefined();
		expect(metadata!.userId).toBe('user123');
		expect(metadata!.tags).toEqual(['important', 'urgent']);
	});

	test('full round-trip: create -> modify -> serialize -> parse -> restore', () => {
		const mockProvider = {} as ThreadProvider;

		const thread1 = new DefaultThread(mockProvider, 'thrd_test123');
		thread1.state.set('messages', [{ id: '1', content: 'hello' }]);
		thread1.state.set('counter', 1);
		thread1.metadata.userId = 'user123';

		const serialized = thread1.getSerializedState();
		const { flatStateJson, metadata } = parseThreadData(serialized);

		const thread2 = new DefaultThread(mockProvider, 'thrd_test456', flatStateJson, metadata);
		if (flatStateJson) {
			const data = JSON.parse(flatStateJson);
			for (const [key, value] of Object.entries(data)) {
				thread2.state.set(key, value);
			}
		}

		expect(thread2.state.get('messages')).toEqual([{ id: '1', content: 'hello' }]);
		expect(thread2.state.get('counter')).toBe(1);
		expect(thread2.metadata.userId).toBe('user123');
	});

	test('round-trip: restored thread is not dirty if unchanged', () => {
		const mockProvider = {} as ThreadProvider;

		const thread1 = new DefaultThread(mockProvider, 'thrd_test123');
		thread1.state.set('messages', ['hello']);

		const serialized = thread1.getSerializedState();
		const { flatStateJson, metadata } = parseThreadData(serialized);

		const thread2 = new DefaultThread(mockProvider, 'thrd_test456', flatStateJson, metadata);
		if (flatStateJson) {
			const data = JSON.parse(flatStateJson);
			for (const [key, value] of Object.entries(data)) {
				thread2.state.set(key, value);
			}
		}

		expect(thread2.isDirty()).toBe(false);
	});

	test('round-trip: restored thread is dirty if modified', () => {
		const mockProvider = {} as ThreadProvider;

		const thread1 = new DefaultThread(mockProvider, 'thrd_test123');
		thread1.state.set('messages', ['hello']);

		const serialized = thread1.getSerializedState();
		const { flatStateJson, metadata } = parseThreadData(serialized);

		const thread2 = new DefaultThread(mockProvider, 'thrd_test456', flatStateJson, metadata);
		if (flatStateJson) {
			const data = JSON.parse(flatStateJson);
			for (const [key, value] of Object.entries(data)) {
				thread2.state.set(key, value);
			}
		}

		thread2.state.set('messages', ['hello', 'world']);

		expect(thread2.isDirty()).toBe(true);
	});
});

describe('Backwards compatibility', () => {
	test('old format state is correctly restored', () => {
		const mockProvider = {} as ThreadProvider;
		const oldFormatJson = JSON.stringify({ messages: ['old', 'format'], counter: 10 });

		const { flatStateJson } = parseThreadData(oldFormatJson);

		const thread = new DefaultThread(mockProvider, 'thrd_test123', flatStateJson);
		if (flatStateJson) {
			const data = JSON.parse(flatStateJson);
			for (const [key, value] of Object.entries(data)) {
				thread.state.set(key, value);
			}
		}

		expect(thread.state.get('messages')).toEqual(['old', 'format']);
		expect(thread.state.get('counter')).toBe(10);
	});

	test('old format does not mistakenly populate "state" or "metadata" keys', () => {
		const mockProvider = {} as ThreadProvider;
		const oldFormatJson = JSON.stringify({ messages: ['test'], userId: 'user123' });

		const { flatStateJson } = parseThreadData(oldFormatJson);

		const thread = new DefaultThread(mockProvider, 'thrd_test123', flatStateJson);
		if (flatStateJson) {
			const data = JSON.parse(flatStateJson);
			for (const [key, value] of Object.entries(data)) {
				thread.state.set(key, value);
			}
		}

		expect(thread.state.has('state')).toBe(false);
		expect(thread.state.has('metadata')).toBe(false);
		expect(thread.state.get('messages')).toEqual(['test']);
		expect(thread.state.get('userId')).toBe('user123');
	});
});
