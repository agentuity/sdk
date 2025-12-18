/**
 * Tests for thread and session metadata functionality.
 * Validates initialization, persistence, and filtering behavior.
 */

import { test, expect, describe } from 'bun:test';
import { DefaultThread, DefaultSession } from '../src/session';
import type { ThreadProvider } from '../src/session';

describe('Thread Metadata', () => {
	test('initializes with empty metadata object', () => {
		const mockProvider = {} as ThreadProvider;
		const thread = new DefaultThread(mockProvider, 'thrd_test123');

		expect(thread.metadata).toBeDefined();
		expect(thread.metadata).toEqual({});
		expect(Object.keys(thread.metadata)).toHaveLength(0);
	});

	test('allows setting metadata properties directly', () => {
		const mockProvider = {} as ThreadProvider;
		const thread = new DefaultThread(mockProvider, 'thrd_test123');

		thread.metadata.userId = 'user123';
		thread.metadata.department = 'sales';

		expect(thread.metadata.userId).toBe('user123');
		expect(thread.metadata.department).toBe('sales');
		expect(Object.keys(thread.metadata)).toHaveLength(2);
	});

	test('preserves existing metadata from constructor', () => {
		const mockProvider = {} as ThreadProvider;
		const existingMetadata = { userId: 'user456', team: 'engineering' };
		const thread = new DefaultThread(mockProvider, 'thrd_test123', undefined, existingMetadata);

		expect(thread.metadata).toEqual(existingMetadata);
		expect(thread.metadata.userId).toBe('user456');
		expect(thread.metadata.team).toBe('engineering');
	});

	test('can replace entire metadata object', () => {
		const mockProvider = {} as ThreadProvider;
		const thread = new DefaultThread(mockProvider, 'thrd_test123');

		thread.metadata = { userId: 'user789', role: 'admin' };

		expect(thread.metadata.userId).toBe('user789');
		expect(thread.metadata.role).toBe('admin');
		expect(Object.keys(thread.metadata)).toHaveLength(2);
	});

	test('supports complex metadata values', () => {
		const mockProvider = {} as ThreadProvider;
		const thread = new DefaultThread(mockProvider, 'thrd_test123');

		thread.metadata.config = { theme: 'dark', language: 'en' };
		thread.metadata.tags = ['important', 'urgent'];
		thread.metadata.count = 42;
		thread.metadata.active = true;

		expect(thread.metadata.config).toEqual({ theme: 'dark', language: 'en' });
		expect(thread.metadata.tags).toEqual(['important', 'urgent']);
		expect(thread.metadata.count).toBe(42);
		expect(thread.metadata.active).toBe(true);
	});
});

describe('Session Metadata', () => {
	test('initializes with empty metadata object', () => {
		const mockProvider = {} as ThreadProvider;
		const thread = new DefaultThread(mockProvider, 'thrd_test123');
		const session = new DefaultSession(thread, 'sess_test456');

		expect(session.metadata).toBeDefined();
		expect(session.metadata).toEqual({});
		expect(Object.keys(session.metadata)).toHaveLength(0);
	});

	test('allows setting metadata properties directly', () => {
		const mockProvider = {} as ThreadProvider;
		const thread = new DefaultThread(mockProvider, 'thrd_test123');
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
		const mockProvider = {} as ThreadProvider;
		const thread = new DefaultThread(mockProvider, 'thrd_test123');
		const existingMetadata = { userId: 'user456', source: 'api' };
		const session = new DefaultSession(thread, 'sess_test456', existingMetadata);

		expect(session.metadata).toEqual(existingMetadata);
		expect(session.metadata.userId).toBe('user456');
		expect(session.metadata.source).toBe('api');
	});

	test('session and thread metadata are independent', () => {
		const mockProvider = {} as ThreadProvider;
		const thread = new DefaultThread(mockProvider, 'thrd_test123');
		const session = new DefaultSession(thread, 'sess_test456');

		thread.metadata.threadProp = 'thread-value';
		session.metadata.sessionProp = 'session-value';

		expect(thread.metadata.threadProp).toBe('thread-value');
		expect(thread.metadata.sessionProp).toBeUndefined();
		expect(session.metadata.sessionProp).toBe('session-value');
		expect(session.metadata.threadProp).toBeUndefined();
	});

	test('supports overwriting metadata values', () => {
		const mockProvider = {} as ThreadProvider;
		const thread = new DefaultThread(mockProvider, 'thrd_test123');
		const session = new DefaultSession(thread, 'sess_test456');

		session.metadata.status = 'pending';
		expect(session.metadata.status).toBe('pending');

		session.metadata.status = 'completed';
		expect(session.metadata.status).toBe('completed');
	});

	test('supports deleting metadata keys', () => {
		const mockProvider = {} as ThreadProvider;
		const thread = new DefaultThread(mockProvider, 'thrd_test123');
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
	test('metadata accepts string values', () => {
		const mockProvider = {} as ThreadProvider;
		const thread = new DefaultThread(mockProvider, 'thrd_test123');

		thread.metadata.stringValue = 'hello';
		expect(typeof thread.metadata.stringValue).toBe('string');
	});

	test('metadata accepts number values', () => {
		const mockProvider = {} as ThreadProvider;
		const thread = new DefaultThread(mockProvider, 'thrd_test123');

		thread.metadata.numberValue = 42;
		expect(typeof thread.metadata.numberValue).toBe('number');
	});

	test('metadata accepts boolean values', () => {
		const mockProvider = {} as ThreadProvider;
		const thread = new DefaultThread(mockProvider, 'thrd_test123');

		thread.metadata.booleanValue = true;
		expect(typeof thread.metadata.booleanValue).toBe('boolean');
	});

	test('metadata accepts array values', () => {
		const mockProvider = {} as ThreadProvider;
		const thread = new DefaultThread(mockProvider, 'thrd_test123');

		thread.metadata.arrayValue = ['a', 'b', 'c'];
		expect(Array.isArray(thread.metadata.arrayValue)).toBe(true);
		expect(thread.metadata.arrayValue).toHaveLength(3);
	});

	test('metadata accepts object values', () => {
		const mockProvider = {} as ThreadProvider;
		const thread = new DefaultThread(mockProvider, 'thrd_test123');

		thread.metadata.objectValue = { nested: { deep: 'value' } };
		expect(typeof thread.metadata.objectValue).toBe('object');
		expect((thread.metadata.objectValue as any).nested.deep).toBe('value');
	});

	test('metadata accepts null values', () => {
		const mockProvider = {} as ThreadProvider;
		const thread = new DefaultThread(mockProvider, 'thrd_test123');

		thread.metadata.nullValue = null;
		expect(thread.metadata.nullValue).toBeNull();
	});
});
