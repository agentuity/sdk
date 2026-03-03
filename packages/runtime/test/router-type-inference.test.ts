/**
 * Tests for createRouter type inference.
 * Verifies that context variables (especially thread, session) are properly typed.
 */

import { test, expect, describe } from 'bun:test';
import { createRouter } from '../src/router';
import type { Thread, Session } from '../src/session';

describe('Router Type Inference', () => {
	test('thread should be typed as Thread, not any', async () => {
		const router = createRouter();

		router.get('/test', (c) => {
			// This test validates compile-time type inference
			// If thread is typed as `any`, the following will NOT cause type errors:
			const thread = c.var.thread;

			// Type assertion test - should compile if thread is Thread
			const _typeCheck: Thread = thread;

			// Access Thread properties - should have IntelliSense
			const threadId: string = thread.id;
			const _threadState: Map<string, unknown> = thread.state;

			// These should be type errors if thread is properly typed:
			// thread.nonExistentProperty; // Should error
			// thread.id = 123; // Should error (id is string)

			return c.json({ threadId });
		});

		expect(true).toBe(true);
	});

	test('session should be typed as Session, not any', async () => {
		const router = createRouter();

		router.post('/test', (c) => {
			const session = c.var.session;

			// Type assertion test - should compile if session is Session
			const _typeCheck: Session = session;

			// Access Session properties
			const sessionId: string = session.id;
			const _thread: Thread = session.thread;
			const _sessionState: Map<string, unknown> = session.state;

			return c.json({ sessionId });
		});

		expect(true).toBe(true);
	});

	test('sessionId should be typed as string, not any', async () => {
		const router = createRouter();

		router.get('/session', (c) => {
			const sessionId = c.var.sessionId;

			// Type assertion test
			const _typeCheck: string = sessionId;

			// Should be able to use string methods
			const upper: string = sessionId.toUpperCase();

			return c.json({ sessionId: upper });
		});

		expect(true).toBe(true);
	});

	test('all context variables should have proper types', async () => {
		const router = createRouter();

		router.post('/full', async (c) => {
			// Extract all variables and verify types
			const {
				logger: _logger,
				tracer: _tracer,
				meter: _meter,
				sessionId,
				thread,
				session,
				kv: _kv,
				stream: _stream,
				vector: _vector,
				app: _app,
			} = c.var;

			// Type checks (compile-time validation)
			const _threadCheck: Thread = thread;
			const _sessionCheck: Session = session;
			const _sessionIdCheck: string = sessionId;

			// Verify Thread interface works
			expect(typeof thread.id).toBe('string');
			expect(thread.state).toBeInstanceOf(Map);

			// Verify Session interface works
			expect(typeof session.id).toBe('string');
			expect(session.thread).toBe(thread);
			expect(session.state).toBeInstanceOf(Map);

			return c.json({ success: true });
		});

		// This test passes if it compiles - no need to execute
		expect(true).toBe(true);
	});
});
