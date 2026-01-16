/**
 * Tests for thread and session metadata functionality.
 * Validates initialization, persistence, and filtering behavior.
 */

import { test, expect, describe } from 'bun:test';
import { DefaultThread, DefaultSession } from '../src/session';
import type { ThreadProvider } from '../src/session';

// Helper to create a thread with restoreFn
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

describe('Thread Metadata', () => {
	const mockProvider = {} as ThreadProvider;

	test('initializes with empty metadata object', async () => {
		const thread = createThread(mockProvider, 'thrd_test123');
		const metadata = await thread.getMetadata();

		expect(metadata).toBeDefined();
		expect(metadata).toEqual({});
		expect(Object.keys(metadata)).toHaveLength(0);
	});

	test('allows setting metadata via setMetadata', async () => {
		const thread = createThread(mockProvider, 'thrd_test123');

		await thread.setMetadata({ userId: 'user123', department: 'sales' });

		const metadata = await thread.getMetadata();
		expect(metadata.userId).toBe('user123');
		expect(metadata.department).toBe('sales');
		expect(Object.keys(metadata)).toHaveLength(2);
	});

	test('preserves existing metadata from constructor', async () => {
		const existingMetadata = { userId: 'user456', team: 'engineering' };
		const thread = createThread(mockProvider, 'thrd_test123', undefined, existingMetadata);

		const metadata = await thread.getMetadata();
		expect(metadata).toEqual(existingMetadata);
		expect(metadata.userId).toBe('user456');
		expect(metadata.team).toBe('engineering');
	});

	test('supports complex metadata values', async () => {
		const thread = createThread(mockProvider, 'thrd_test123');

		await thread.setMetadata({
			config: { theme: 'dark', language: 'en' },
			tags: ['important', 'urgent'],
			count: 42,
			active: true,
		});

		const metadata = await thread.getMetadata();
		expect(metadata.config).toEqual({ theme: 'dark', language: 'en' });
		expect(metadata.tags).toEqual(['important', 'urgent']);
		expect(metadata.count).toBe(42);
		expect(metadata.active).toBe(true);
	});
});

describe('Session Metadata', () => {
	const mockProvider = {} as ThreadProvider;

	test('initializes with empty metadata object', () => {
		const thread = createThread(mockProvider, 'thrd_test123');
		const session = new DefaultSession(thread, 'sess_test456');

		expect(session.metadata).toBeDefined();
		expect(session.metadata).toEqual({});
		expect(Object.keys(session.metadata)).toHaveLength(0);
	});

	test('allows setting metadata properties directly', () => {
		const thread = createThread(mockProvider, 'thrd_test123');
		const session = new DefaultSession(thread, 'sess_test456');

		session.metadata.userId = 'user123';
		session.metadata.requestType = 'chat';
		session.metadata.priority = 'high';

		expect(session.metadata.userId).toBe('user123');
		expect(session.metadata.requestType).toBe('chat');
		expect(session.metadata.priority).toBe('high');
		expect(Object.keys(session.metadata)).toHaveLength(3);
	});

	test('preserves existing metadata from constructor', () => {
		const thread = createThread(mockProvider, 'thrd_test123');
		const existingMetadata = { userId: 'user456', source: 'api' };
		const session = new DefaultSession(thread, 'sess_test456', existingMetadata);

		expect(session.metadata).toEqual(existingMetadata);
		expect(session.metadata.userId).toBe('user456');
		expect(session.metadata.source).toBe('api');
	});

	test('session and thread metadata are independent', async () => {
		const thread = createThread(mockProvider, 'thrd_test123');
		const session = new DefaultSession(thread, 'sess_test456');

		await thread.setMetadata({ threadProp: 'thread-value' });
		session.metadata.sessionProp = 'session-value';

		const threadMeta = await thread.getMetadata();
		expect(threadMeta.threadProp).toBe('thread-value');
		expect(threadMeta.sessionProp).toBeUndefined();
		expect(session.metadata.sessionProp).toBe('session-value');
		expect(session.metadata.threadProp).toBeUndefined();
	});

	test('supports overwriting metadata values', () => {
		const thread = createThread(mockProvider, 'thrd_test123');
		const session = new DefaultSession(thread, 'sess_test456');

		session.metadata.status = 'pending';
		expect(session.metadata.status).toBe('pending');

		session.metadata.status = 'completed';
		expect(session.metadata.status).toBe('completed');
	});

	test('supports deleting metadata keys', () => {
		const thread = createThread(mockProvider, 'thrd_test123');
		const session = new DefaultSession(thread, 'sess_test456');

		session.metadata.tempKey = 'temporary';
		expect(session.metadata.tempKey).toBe('temporary');

		delete session.metadata.tempKey;
		expect(session.metadata.tempKey).toBeUndefined();
		expect(Object.keys(session.metadata)).toHaveLength(0);
	});
});

describe('Metadata Persistence Logic', () => {
	test('empty metadata should be sent as undefined', () => {
		const metadata = {};
		const shouldSend = Object.keys(metadata).length > 0 ? metadata : undefined;

		expect(shouldSend).toBeUndefined();
	});

	test('non-empty metadata should be sent', () => {
		const metadata = { userId: 'user123' };
		const shouldSend = Object.keys(metadata).length > 0 ? metadata : undefined;

		expect(shouldSend).toBeDefined();
		expect(shouldSend).toEqual({ userId: 'user123' });
	});

	test('metadata with undefined values still counts as non-empty', () => {
		const metadata = { userId: 'user123', optionalProp: undefined };
		const shouldSend = Object.keys(metadata).length > 0 ? metadata : undefined;

		expect(shouldSend).toBeDefined();
		expect(Object.keys(shouldSend!)).toHaveLength(2);
	});
});

describe('Metadata Type Safety', () => {
	const mockProvider = {} as ThreadProvider;

	test('metadata accepts string values', async () => {
		const thread = createThread(mockProvider, 'thrd_test123');
		await thread.setMetadata({ stringValue: 'hello' });

		const metadata = await thread.getMetadata();
		expect(typeof metadata.stringValue).toBe('string');
	});

	test('metadata accepts number values', async () => {
		const thread = createThread(mockProvider, 'thrd_test123');
		await thread.setMetadata({ numberValue: 42 });

		const metadata = await thread.getMetadata();
		expect(typeof metadata.numberValue).toBe('number');
	});

	test('metadata accepts boolean values', async () => {
		const thread = createThread(mockProvider, 'thrd_test123');
		await thread.setMetadata({ booleanValue: true });

		const metadata = await thread.getMetadata();
		expect(typeof metadata.booleanValue).toBe('boolean');
	});

	test('metadata accepts array values', async () => {
		const thread = createThread(mockProvider, 'thrd_test123');
		await thread.setMetadata({ arrayValue: ['a', 'b', 'c'] });

		const metadata = await thread.getMetadata();
		expect(Array.isArray(metadata.arrayValue)).toBe(true);
		expect(metadata.arrayValue).toHaveLength(3);
	});

	test('metadata accepts object values', async () => {
		const thread = createThread(mockProvider, 'thrd_test123');
		await thread.setMetadata({ objectValue: { nested: { deep: 'value' } } });

		const metadata = await thread.getMetadata();
		expect(typeof metadata.objectValue).toBe('object');
		expect((metadata.objectValue as Record<string, Record<string, string>>).nested.deep).toBe(
			'value'
		);
	});

	test('metadata accepts null values', async () => {
		const thread = createThread(mockProvider, 'thrd_test123');
		await thread.setMetadata({ nullValue: null });

		const metadata = await thread.getMetadata();
		expect(metadata.nullValue).toBeNull();
	});
});

describe('Thread Serialization and Persistence', () => {
	const mockProvider = {} as ThreadProvider;

	test('getSerializedState returns empty string when no state or metadata', async () => {
		const thread = createThread(mockProvider, 'thrd_test123');

		const serialized = await thread.getSerializedState();
		expect(serialized).toBe('');
	});

	test('getSerializedState includes only state when metadata is empty', async () => {
		const thread = createThread(mockProvider, 'thrd_test123');

		await thread.state.set('key1', 'value1');

		const serialized = await thread.getSerializedState();
		const parsed = JSON.parse(serialized);

		expect(parsed.state).toBeDefined();
		expect(parsed.state.key1).toBe('value1');
		expect(parsed.metadata).toBeUndefined();
	});

	test('getSerializedState includes only metadata when state is empty', async () => {
		const thread = createThread(mockProvider, 'thrd_test123');

		await thread.setMetadata({ userId: 'user123' });

		const serialized = await thread.getSerializedState();
		const parsed = JSON.parse(serialized);

		expect(parsed.metadata).toBeDefined();
		expect(parsed.metadata.userId).toBe('user123');
		expect(parsed.state).toBeUndefined();
	});

	test('getSerializedState includes both state and metadata when both exist', async () => {
		const thread = createThread(mockProvider, 'thrd_test123');

		await thread.state.set('counter', 5);
		await thread.setMetadata({ userId: 'user123' });

		const serialized = await thread.getSerializedState();
		const parsed = JSON.parse(serialized);

		expect(parsed.state).toBeDefined();
		expect(parsed.state.counter).toBe(5);
		expect(parsed.metadata).toBeDefined();
		expect(parsed.metadata.userId).toBe('user123');
	});

	test('empty() returns true when both state and metadata are empty', async () => {
		const thread = createThread(mockProvider, 'thrd_test123');

		expect(await thread.empty()).toBe(true);
	});

	test('empty() returns false when state has data', async () => {
		const thread = createThread(mockProvider, 'thrd_test123', { key: 'value' });

		// Trigger load
		await thread.state.get('key');

		expect(await thread.empty()).toBe(false);
	});

	test('empty() returns false when metadata has data', async () => {
		const thread = createThread(mockProvider, 'thrd_test123', undefined, { userId: 'user123' });

		expect(await thread.empty()).toBe(false);
	});

	test('empty() returns false when both state and metadata have data', async () => {
		const thread = createThread(
			mockProvider,
			'thrd_test123',
			{ key: 'value' },
			{ userId: 'user123' }
		);

		// Trigger load
		await thread.state.get('key');

		expect(await thread.empty()).toBe(false);
	});
});
