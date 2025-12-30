/**
 * Integration tests for LocalThreadProvider logic.
 * Tests thread persistence by directly testing the save/restore format handling.
 */

import { test, expect, describe } from 'bun:test';
import { DefaultThread, parseThreadData, type ThreadProvider } from '../src/session';

describe('LocalThreadProvider format handling', () => {
	test('saves and restores thread state correctly using getSerializedState', () => {
		const mockProvider = {} as ThreadProvider;

		const thread1 = new DefaultThread(mockProvider, 'thrd_test123');
		thread1.state.set('messages', [{ id: '1', content: 'hello' }]);
		thread1.state.set('counter', 42);

		const serialized = thread1.getSerializedState();

		const { flatStateJson, metadata } = parseThreadData(serialized);
		const thread2 = new DefaultThread(mockProvider, 'thrd_test123', flatStateJson, metadata);

		if (flatStateJson) {
			const data = JSON.parse(flatStateJson);
			for (const [key, value] of Object.entries(data)) {
				thread2.state.set(key, value);
			}
		}

		expect(thread2.state.get('messages')).toEqual([{ id: '1', content: 'hello' }]);
		expect(thread2.state.get('counter')).toBe(42);
	});

	test('restores metadata correctly', () => {
		const mockProvider = {} as ThreadProvider;

		const thread1 = new DefaultThread(mockProvider, 'thrd_test456');
		thread1.state.set('data', 'test');
		thread1.metadata.userId = 'user123';
		thread1.metadata.role = 'admin';

		const serialized = thread1.getSerializedState();

		const { flatStateJson, metadata } = parseThreadData(serialized);
		const thread2 = new DefaultThread(mockProvider, 'thrd_test456', flatStateJson, metadata);

		if (flatStateJson) {
			const data = JSON.parse(flatStateJson);
			for (const [key, value] of Object.entries(data)) {
				thread2.state.set(key, value);
			}
		}

		expect(thread2.metadata.userId).toBe('user123');
		expect(thread2.metadata.role).toBe('admin');
	});

	test('multiple save/restore cycles preserve state correctly', () => {
		const mockProvider = {} as ThreadProvider;

		let serialized: string;

		const thread1 = new DefaultThread(mockProvider, 'thrd_multi');
		thread1.state.set('messages', ['msg1']);
		serialized = thread1.getSerializedState();

		const { flatStateJson: flat1, metadata: meta1 } = parseThreadData(serialized);
		const thread2 = new DefaultThread(mockProvider, 'thrd_multi', flat1, meta1);
		if (flat1) {
			const data = JSON.parse(flat1);
			for (const [key, value] of Object.entries(data)) {
				thread2.state.set(key, value);
			}
		}
		const messages2 = thread2.state.get('messages') as string[];
		messages2.push('msg2');
		thread2.state.set('messages', messages2);
		serialized = thread2.getSerializedState();

		const { flatStateJson: flat2, metadata: meta2 } = parseThreadData(serialized);
		const thread3 = new DefaultThread(mockProvider, 'thrd_multi', flat2, meta2);
		if (flat2) {
			const data = JSON.parse(flat2);
			for (const [key, value] of Object.entries(data)) {
				thread3.state.set(key, value);
			}
		}
		const messages3 = thread3.state.get('messages') as string[];
		messages3.push('msg3');
		thread3.state.set('messages', messages3);
		serialized = thread3.getSerializedState();

		const { flatStateJson: flat3, metadata: meta3 } = parseThreadData(serialized);
		const thread4 = new DefaultThread(mockProvider, 'thrd_multi', flat3, meta3);
		if (flat3) {
			const data = JSON.parse(flat3);
			for (const [key, value] of Object.entries(data)) {
				thread4.state.set(key, value);
			}
		}

		expect(thread4.state.get('messages')).toEqual(['msg1', 'msg2', 'msg3']);
	});

	test('does not mark as dirty if not modified after restore', () => {
		const mockProvider = {} as ThreadProvider;

		const thread1 = new DefaultThread(mockProvider, 'thrd_nodirty');
		thread1.state.set('value', 'original');
		const serialized = thread1.getSerializedState();

		const { flatStateJson, metadata } = parseThreadData(serialized);
		const thread2 = new DefaultThread(mockProvider, 'thrd_nodirty', flatStateJson, metadata);
		if (flatStateJson) {
			const data = JSON.parse(flatStateJson);
			for (const [key, value] of Object.entries(data)) {
				thread2.state.set(key, value);
			}
		}

		expect(thread2.isDirty()).toBe(false);
	});

	test('handles empty thread correctly', () => {
		const mockProvider = {} as ThreadProvider;

		const thread = new DefaultThread(mockProvider, 'thrd_empty');

		expect(thread.state.size).toBe(0);
		expect(Object.keys(thread.metadata)).toHaveLength(0);
		expect(thread.isDirty()).toBe(false);
	});

	test('handles backwards compatible old format data', () => {
		const mockProvider = {} as ThreadProvider;
		const oldFormatData = JSON.stringify({ messages: ['old', 'data'], counter: 10 });

		const { flatStateJson, metadata } = parseThreadData(oldFormatData);
		const thread = new DefaultThread(mockProvider, 'thrd_oldformat', flatStateJson, metadata);
		if (flatStateJson) {
			const data = JSON.parse(flatStateJson);
			for (const [key, value] of Object.entries(data)) {
				thread.state.set(key, value);
			}
		}

		expect(thread.state.get('messages')).toEqual(['old', 'data']);
		expect(thread.state.get('counter')).toBe(10);
		expect(thread.state.has('state')).toBe(false);
	});

	test('handles new format data correctly', () => {
		const mockProvider = {} as ThreadProvider;
		const newFormatData = JSON.stringify({
			state: { messages: ['new', 'format'] },
			metadata: { userId: 'user789' },
		});

		const { flatStateJson, metadata } = parseThreadData(newFormatData);
		const thread = new DefaultThread(mockProvider, 'thrd_newformat', flatStateJson, metadata);
		if (flatStateJson) {
			const data = JSON.parse(flatStateJson);
			for (const [key, value] of Object.entries(data)) {
				thread.state.set(key, value);
			}
		}

		expect(thread.state.get('messages')).toEqual(['new', 'format']);
		expect(thread.state.has('state')).toBe(false);
		expect(thread.metadata.userId).toBe('user789');
	});

	test('complex state with nested objects persists correctly', () => {
		const mockProvider = {} as ThreadProvider;

		const thread1 = new DefaultThread(mockProvider, 'thrd_complex');
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

		thread1.state.set('data', complexState);
		const serialized = thread1.getSerializedState();

		const { flatStateJson, metadata } = parseThreadData(serialized);
		const thread2 = new DefaultThread(mockProvider, 'thrd_complex', flatStateJson, metadata);
		if (flatStateJson) {
			const data = JSON.parse(flatStateJson);
			for (const [key, value] of Object.entries(data)) {
				thread2.state.set(key, value);
			}
		}

		const restored = thread2.state.get('data') as typeof complexState;

		expect(restored.messages).toHaveLength(2);
		expect(restored.messages[0].metadata.sentiment).toBe('positive');
		expect(restored.config.nested.deeply.value).toBe(42);
		expect(restored.config.nested.deeply.array).toEqual([1, 2, 3]);
	});

	test('data with "state" key is interpreted as new format', () => {
		const mockProvider = {} as ThreadProvider;
		const dataWithStateKey = JSON.stringify({
			state: { actualData: 'stored in state wrapper' },
			metadata: { userId: 'user123' },
		});

		const { flatStateJson, metadata } = parseThreadData(dataWithStateKey);

		expect(flatStateJson).toBe(JSON.stringify({ actualData: 'stored in state wrapper' }));
		expect(metadata).toEqual({ userId: 'user123' });

		const thread = new DefaultThread(mockProvider, 'thrd_test', flatStateJson, metadata);
		if (flatStateJson) {
			const data = JSON.parse(flatStateJson);
			for (const [key, value] of Object.entries(data)) {
				thread.state.set(key, value);
			}
		}

		expect(thread.state.get('actualData')).toBe('stored in state wrapper');
		expect(thread.state.has('state')).toBe(false);
	});
});
