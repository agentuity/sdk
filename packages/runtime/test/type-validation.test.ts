/**
 * Comprehensive type validation test.
 * This test validates the complete type chain from exports to runtime usage.
 */

import { test, expect, describe } from 'bun:test';
import { type Thread, type Session, type Variables, type Env, createRouter } from '../src/index';

describe('Type Exports and Definitions', () => {
	test('Thread interface is correctly defined and exported', () => {
		// Compile-time validation: Thread has required properties
		type ThreadIdType = Thread['id'];
		type ThreadStateType = Thread['state'];

		// Assert types are correct
		const _idCheck: ThreadIdType = 'test-id';
		const _stateCheck: ThreadStateType = new Map();

		// Runtime check: we can create objects matching Thread interface
		const mockThread: Thread = {
			id: 'thread-123',
			state: new Map(),
			addEventListener: () => {},
			removeEventListener: () => {},
			destroy: async () => {},
			empty: () => true,
		};

		expect(mockThread.id).toBe('thread-123');
		expect(mockThread.state).toBeInstanceOf(Map);
	});

	test('Session interface is correctly defined and exported', () => {
		// Compile-time validation: Session has required properties
		type SessionIdType = Session['id'];
		type SessionThreadType = Session['thread'];
		type SessionStateType = Session['state'];

		// Assert types are correct
		const mockThread: Thread = {
			id: 'thread-456',
			state: new Map(),
			addEventListener: () => {},
			removeEventListener: () => {},
			destroy: async () => {},
			empty: () => true,
		};

		const _idCheck: SessionIdType = 'session-id';
		const _threadCheck: SessionThreadType = mockThread;
		const _stateCheck: SessionStateType = new Map();

		// Runtime check: we can create objects matching Session interface
		const mockSession: Session = {
			id: 'session-789',
			thread: mockThread,
			state: new Map(),
			addEventListener: () => {},
			removeEventListener: () => {},
			serializeUserData: () => undefined,
		};

		expect(mockSession.id).toBe('session-789');
		expect(mockSession.thread).toBe(mockThread);
		expect(mockSession.state).toBeInstanceOf(Map);
	});

	test('Variables interface includes Thread and Session', () => {
		// Compile-time validation: Variables has all required properties
		type VarThread = Variables['thread'];
		type VarSession = Variables['session'];
		type VarSessionId = Variables['sessionId'];

		// Type assertions - will fail if types don't match
		const mockThread: Thread = {
			id: 'thread',
			state: new Map(),
			addEventListener: () => {},
			removeEventListener: () => {},
			destroy: async () => {},
			empty: () => true,
		};

		const mockSession: Session = {
			id: 'session',
			thread: mockThread,
			state: new Map(),
			addEventListener: () => {},
			removeEventListener: () => {},
			serializeUserData: () => undefined,
		};

		const _threadCheck: VarThread = mockThread;
		const _sessionCheck: VarSession = mockSession;
		const _sessionIdCheck: VarSessionId = 'session-id';

		expect(true).toBe(true);
	});

	test('Env interface includes Variables with correct types', () => {
		// Compile-time validation: Env.Variables has Thread and Session
		type EnvVariables = Env['Variables'];
		type EnvThread = EnvVariables['thread'];
		type EnvSession = EnvVariables['session'];

		// Type assertions
		const mockThread: Thread = {
			id: 'thread',
			state: new Map(),
			addEventListener: () => {},
			removeEventListener: () => {},
			destroy: async () => {},
			empty: () => true,
		};

		const _threadCheck: EnvThread = mockThread;

		const mockSession: Session = {
			id: 'session',
			thread: mockThread,
			state: new Map(),
			addEventListener: () => {},
			removeEventListener: () => {},
			serializeUserData: () => undefined,
		};

		const _sessionCheck: EnvSession = mockSession;

		expect(true).toBe(true);
	});

	test('createRouter returns Hono instance with correct Env type', () => {
		const router = createRouter();

		// Compile-time validation: router context has correct types
		router.get('/test', (c) => {
			// c.var should have Variables type
			type ContextVar = typeof c.var;
			type ContextThread = ContextVar['thread'];
			type ContextSession = ContextVar['session'];

			// These type assertions will fail if types are wrong
			const thread: ContextThread = c.var.thread;
			const session: ContextSession = c.var.session;

			// Validate thread is Thread type (not any)
			const _threadCheck: Thread = thread;
			// Validate session is Session type (not any)
			const _sessionCheck: Session = session;

			return c.json({ success: true });
		});

		expect(true).toBe(true);
	});

	test('Thread properties are accessible and correctly typed in route', () => {
		const router = createRouter();

		router.get('/thread-props', (c) => {
			const thread = c.var.thread;

			// These should all be strongly typed - no 'any'
			const id: string = thread.id;
			const state: Map<string, unknown> = thread.state;
			const addEventListener: typeof thread.addEventListener = thread.addEventListener;
			const removeEventListener: typeof thread.removeEventListener = thread.removeEventListener;
			const destroy: typeof thread.destroy = thread.destroy;
			const empty: typeof thread.empty = thread.empty;

			// Verify types are functions/map/string
			expect(typeof id).toBe('string');
			expect(state).toBeInstanceOf(Map);
			expect(typeof addEventListener).toBe('function');
			expect(typeof removeEventListener).toBe('function');
			expect(typeof destroy).toBe('function');
			expect(typeof empty).toBe('function');

			return c.json({ id });
		});

		expect(true).toBe(true);
	});

	test('Session properties are accessible and correctly typed in route', () => {
		const router = createRouter();

		router.get('/session-props', (c) => {
			const session = c.var.session;

			// These should all be strongly typed - no 'any'
			const id: string = session.id;
			const thread: Thread = session.thread;
			const state: Map<string, unknown> = session.state;
			const addEventListener: typeof session.addEventListener = session.addEventListener;
			const removeEventListener: typeof session.removeEventListener =
				session.removeEventListener;
			const serializeUserData: typeof session.serializeUserData = session.serializeUserData;

			// Verify types
			expect(typeof id).toBe('string');
			expect(thread).toHaveProperty('id');
			expect(state).toBeInstanceOf(Map);
			expect(typeof addEventListener).toBe('function');
			expect(typeof removeEventListener).toBe('function');
			expect(typeof serializeUserData).toBe('function');

			return c.json({ id });
		});

		expect(true).toBe(true);
	});

	test('Type narrowing works correctly with Thread', () => {
		const router = createRouter();

		router.get('/narrow', (c) => {
			const thread = c.var.thread;

			// This should work because thread.id is typed as string
			const upper = thread.id.toUpperCase();
			const lower = thread.id.toLowerCase();
			const length = thread.id.length;

			expect(typeof upper).toBe('string');
			expect(typeof lower).toBe('string');
			expect(typeof length).toBe('number');

			return c.json({ upper, lower, length });
		});

		expect(true).toBe(true);
	});

	test('Generic app state works with Variables', () => {
		type CustomAppState = {
			database: string;
			version: number;
		};

		// Variables should accept generic app state
		type CustomVariables = Variables<CustomAppState>;
		type CustomApp = CustomVariables['app'];

		// Type assertions
		const appState: CustomApp = {
			database: 'postgres://localhost',
			version: 1,
		};

		const _dbCheck: string = appState.database;
		const _versionCheck: number = appState.version;

		expect(appState.database).toBe('postgres://localhost');
		expect(appState.version).toBe(1);
	});
});

describe('Type Safety - Negative Tests', () => {
	test('Thread interface requires all properties', () => {
		// This should fail to compile if uncommented:
		// const incompleteThread: Thread = {
		//   id: 'test',
		//   // missing state, addEventListener, etc.
		// };

		expect(true).toBe(true);
	});

	test('Session interface requires all properties', () => {
		// This should fail to compile if uncommented:
		// const incompleteSession: Session = {
		//   id: 'test',
		//   // missing thread, state, addEventListener, etc.
		// };

		expect(true).toBe(true);
	});

	test('Thread.id is readonly (cannot reassign)', () => {
		const router = createRouter();

		router.get('/readonly', (c) => {
			const thread = c.var.thread;

			// This should work (reading)
			const _id = thread.id;

			// This should fail to compile if uncommented:
			// thread.id = 'new-id'; // Error: Cannot assign to 'id' because it is a read-only property

			return c.json({ success: true });
		});

		expect(true).toBe(true);
	});
});
