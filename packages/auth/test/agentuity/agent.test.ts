import { describe, test, expect } from 'bun:test';
import { withAuth, createScopeChecker } from '../../src/agentuity/agent';
import type { AgentAuthContext } from '../../src/agentuity/agent';

describe('withAuth agent wrapper', () => {
	const createMockContext = (
		auth: { user: { id: string }; session: { id: string } } | null,
		scopes: string[] = []
	): AgentAuthContext => ({
		auth: auth as any,
		hasScope: createScopeChecker(scopes),
	});

	test('passes through to handler when authenticated', async () => {
		const handler = withAuth(async (ctx, input: { name: string }) => {
			return { greeting: `Hello ${input.name}` };
		});

		const ctx = createMockContext(
			{ user: { id: 'user_123' }, session: { id: 'session_456' } },
			['read']
		);

		const result = await handler(ctx, { name: 'World' });
		expect(result).toEqual({ greeting: 'Hello World' });
	});

	test('throws when not authenticated and not optional', async () => {
		const handler = withAuth(async (_ctx, _input: {}) => {
			return { success: true };
		});

		const ctx = createMockContext(null);

		await expect(handler(ctx, {})).rejects.toThrow('Unauthenticated');
	});

	test('allows unauthenticated when optional=true', async () => {
		const handler = withAuth(
			async (ctx, _input: {}) => {
				return { hasAuth: ctx.auth !== null };
			},
			{ optional: true }
		);

		const ctx = createMockContext(null);
		const result = await handler(ctx, {});
		expect(result).toEqual({ hasAuth: false });
	});

	test('throws when required scopes are missing', async () => {
		const handler = withAuth(
			async (_ctx, _input: {}) => {
				return { success: true };
			},
			{ requiredScopes: ['write', 'admin'] }
		);

		const ctx = createMockContext(
			{ user: { id: 'user_123' }, session: { id: 'session_456' } },
			['read', 'write']
		);

		await expect(handler(ctx, {})).rejects.toThrow('Missing required scopes: admin');
	});

	test('passes when all required scopes are present', async () => {
		const handler = withAuth(
			async (_ctx, _input: {}) => {
				return { success: true };
			},
			{ requiredScopes: ['read', 'write'] }
		);

		const ctx = createMockContext(
			{ user: { id: 'user_123' }, session: { id: 'session_456' } },
			['read', 'write', 'admin']
		);

		const result = await handler(ctx, {});
		expect(result).toEqual({ success: true });
	});

	test('provides auth context to handler', async () => {
		const handler = withAuth(async (ctx, _input: {}) => {
			return {
				userId: ctx.auth?.user.id,
				sessionId: ctx.auth?.session.id,
			};
		});

		const ctx = createMockContext(
			{ user: { id: 'user_123' }, session: { id: 'session_456' } },
			[]
		);

		const result = await handler(ctx, {});
		expect(result).toEqual({
			userId: 'user_123',
			sessionId: 'session_456',
		});
	});
});

describe('createScopeChecker', () => {
	test('returns true for matching scope', () => {
		const hasScope = createScopeChecker(['read', 'write']);
		expect(hasScope('read')).toBe(true);
		expect(hasScope('write')).toBe(true);
	});

	test('returns false for non-matching scope', () => {
		const hasScope = createScopeChecker(['read', 'write']);
		expect(hasScope('delete')).toBe(false);
		expect(hasScope('admin')).toBe(false);
	});

	test('wildcard (*) matches any scope', () => {
		const hasScope = createScopeChecker(['*']);
		expect(hasScope('read')).toBe(true);
		expect(hasScope('write')).toBe(true);
		expect(hasScope('anything')).toBe(true);
	});

	test('empty scopes returns false for any check', () => {
		const hasScope = createScopeChecker([]);
		expect(hasScope('read')).toBe(false);
	});
});
