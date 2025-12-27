/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, test, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import * as runtimeModule from '@agentuity/runtime';

describe('withSession', () => {
	let inAgentContextSpy: ReturnType<typeof spyOn>;
	let getAgentContextSpy: ReturnType<typeof spyOn>;
	let inHTTPContextSpy: ReturnType<typeof spyOn>;
	let getHTTPContextSpy: ReturnType<typeof spyOn>;

	function createMockAgentContext(stateEntries: [string, unknown][] = []) {
		const state = new Map<string, unknown>(stateEntries);
		return {
			sessionId: 'mock-session',
			agentName: 'mock-agent',
			state,
			logger: {
				trace: () => {},
				debug: () => {},
				info: () => {},
				warn: () => {},
				error: () => {},
				fatal: () => {},
				child: () => ({}),
			},
		};
	}

	beforeEach(() => {
		inAgentContextSpy = spyOn(runtimeModule, 'inAgentContext');
		getAgentContextSpy = spyOn(runtimeModule, 'getAgentContext');
		inHTTPContextSpy = spyOn(runtimeModule, 'inHTTPContext');
		getHTTPContextSpy = spyOn(runtimeModule, 'getHTTPContext');
	});

	afterEach(() => {
		inAgentContextSpy.mockRestore();
		getAgentContextSpy.mockRestore();
		inHTTPContextSpy.mockRestore();
		getHTTPContextSpy.mockRestore();
	});

	test('throws when not in agent context', async () => {
		inAgentContextSpy.mockReturnValue(false);

		const { withSession } = await import('../../src/agentuity/agent');

		const handler = withSession(async (_ctx, _session, input: string) => input);
		const mockCtx = createMockAgentContext();

		await expect(handler(mockCtx as any, 'test')).rejects.toThrow(
			'withSession must be used inside an Agentuity agent'
		);
	});

	test('throws when auth required but not present', async () => {
		const agentContext = createMockAgentContext();
		inAgentContextSpy.mockReturnValue(true);
		getAgentContextSpy.mockReturnValue(agentContext);
		inHTTPContextSpy.mockReturnValue(false);

		const { withSession } = await import('../../src/agentuity/agent');

		const testHandler = async (
			_ctx: any,
			session: { auth: any; org: any; hasScope: (s: string) => boolean },
			input: string
		) => {
			return { input, auth: session.auth };
		};

		const wrapped = withSession(testHandler, { optional: false });

		await expect(wrapped(agentContext as any, 'test-input')).rejects.toThrow(
			'Unauthenticated: This agent requires authentication'
		);
	});

	test('allows null auth when optional: true', async () => {
		const agentContext = createMockAgentContext();
		inAgentContextSpy.mockReturnValue(true);
		getAgentContextSpy.mockReturnValue(agentContext);
		inHTTPContextSpy.mockReturnValue(false);

		const { withSession } = await import('../../src/agentuity/agent');

		const testHandler = async (
			_ctx: any,
			session: { auth: any; org: any; hasScope: (s: string) => boolean },
			input: string
		) => {
			return { input, auth: session.auth, org: session.org };
		};

		const wrapped = withSession(testHandler, { optional: true });
		const result = await wrapped(agentContext as any, 'test-input');

		expect(result.input).toBe('test-input');
		expect(result.auth).toBeNull();
		expect(result.org).toBeNull();
	});

	test('returns hasScope function that works correctly', async () => {
		const agentContext = createMockAgentContext([
			[
				'@agentuity/auth',
				{
					user: { id: 'user-123', scopes: ['read', 'write'] },
					session: { id: 'sess-456' },
				},
			],
		]);
		inAgentContextSpy.mockReturnValue(true);
		getAgentContextSpy.mockReturnValue(agentContext);
		inHTTPContextSpy.mockReturnValue(false);

		const { withSession } = await import('../../src/agentuity/agent');

		const testHandler = async (
			_ctx: any,
			session: { auth: any; org: any; hasScope: (s: string) => boolean },
			_input: string
		) => {
			return {
				hasRead: session.hasScope('read'),
				hasWrite: session.hasScope('write'),
				hasAdmin: session.hasScope('admin'),
			};
		};

		const wrapped = withSession(testHandler, { optional: true });
		const result = await wrapped(agentContext as any, 'test-input');

		expect(result.hasRead).toBe(true);
		expect(result.hasWrite).toBe(true);
		expect(result.hasAdmin).toBe(false);
	});

	test('throws when required scopes are missing', async () => {
		const agentContext = createMockAgentContext([
			[
				'@agentuity/auth',
				{
					user: { id: 'user-123', scopes: ['read'] },
					session: { id: 'sess-456' },
				},
			],
		]);
		inAgentContextSpy.mockReturnValue(true);
		getAgentContextSpy.mockReturnValue(agentContext);
		inHTTPContextSpy.mockReturnValue(false);

		const { withSession } = await import('../../src/agentuity/agent');

		const testHandler = async (
			_ctx: any,
			_session: { auth: any; org: any; hasScope: (s: string) => boolean },
			input: string
		) => {
			return { input };
		};

		const wrapped = withSession(testHandler, { requiredScopes: ['read', 'admin'] });

		await expect(wrapped(agentContext as any, 'test-input')).rejects.toThrow(
			'Forbidden: Missing required scopes: admin'
		);
	});

	test('passes when all required scopes are present', async () => {
		const agentContext = createMockAgentContext([
			[
				'@agentuity/auth',
				{
					user: { id: 'user-123', scopes: ['read', 'write', 'admin'] },
					session: { id: 'sess-456' },
				},
			],
		]);
		inAgentContextSpy.mockReturnValue(true);
		getAgentContextSpy.mockReturnValue(agentContext);
		inHTTPContextSpy.mockReturnValue(false);

		const { withSession } = await import('../../src/agentuity/agent');

		const testHandler = async (
			_ctx: any,
			session: { auth: any; org: any; hasScope: (s: string) => boolean },
			input: string
		) => {
			return { input, userId: session.auth.user.id };
		};

		const wrapped = withSession(testHandler, { requiredScopes: ['read', 'admin'] });
		const result = await wrapped(agentContext as any, 'test-input');

		expect(result.input).toBe('test-input');
		expect(result.userId).toBe('user-123');
	});

	test('extracts organization context from auth', async () => {
		const agentContext = createMockAgentContext([
			[
				'@agentuity/auth',
				{
					user: {
						id: 'user-123',
						activeOrganization: {
							id: 'org-789',
							slug: 'test-org',
							name: 'Test Organization',
						},
						activeOrganizationRole: 'admin',
						activeOrganizationMemberId: 'member-456',
					},
					session: { id: 'sess-456', activeOrganizationId: 'org-789' },
				},
			],
		]);
		inAgentContextSpy.mockReturnValue(true);
		getAgentContextSpy.mockReturnValue(agentContext);
		inHTTPContextSpy.mockReturnValue(false);

		const { withSession } = await import('../../src/agentuity/agent');

		const testHandler = async (
			_ctx: any,
			session: { auth: any; org: any; hasScope: (s: string) => boolean },
			_input: string
		) => {
			return {
				orgId: session.org?.id,
				orgSlug: session.org?.slug,
				orgName: session.org?.name,
				orgRole: session.org?.role,
				memberId: session.org?.memberId,
			};
		};

		const wrapped = withSession(testHandler, { optional: true });
		const result = await wrapped(agentContext as any, 'test-input');

		expect(result.orgId).toBe('org-789');
		expect(result.orgSlug).toBe('test-org');
		expect(result.orgName).toBe('Test Organization');
		expect(result.orgRole).toBe('admin');
		expect(result.memberId).toBe('member-456');
	});

	test('wildcard scope (*) grants all permissions', async () => {
		const agentContext = createMockAgentContext([
			[
				'@agentuity/auth',
				{
					user: { id: 'user-123', scopes: ['*'] },
					session: { id: 'sess-456' },
				},
			],
		]);
		inAgentContextSpy.mockReturnValue(true);
		getAgentContextSpy.mockReturnValue(agentContext);
		inHTTPContextSpy.mockReturnValue(false);

		const { withSession } = await import('../../src/agentuity/agent');

		const testHandler = async (
			_ctx: any,
			session: { auth: any; org: any; hasScope: (s: string) => boolean },
			_input: string
		) => {
			return {
				hasAny: session.hasScope('anything'),
				hasAdmin: session.hasScope('admin'),
				hasSuper: session.hasScope('super:secret:scope'),
			};
		};

		const wrapped = withSession(testHandler, { requiredScopes: ['admin', 'super:secret:scope'] });
		const result = await wrapped(agentContext as any, 'test-input');

		expect(result.hasAny).toBe(true);
		expect(result.hasAdmin).toBe(true);
		expect(result.hasSuper).toBe(true);
	});

	test('handles scopes as space-delimited string', async () => {
		const agentContext = createMockAgentContext([
			[
				'@agentuity/auth',
				{
					user: { id: 'user-123' },
					session: { id: 'sess-456', scopes: 'read write admin' },
				},
			],
		]);
		inAgentContextSpy.mockReturnValue(true);
		getAgentContextSpy.mockReturnValue(agentContext);
		inHTTPContextSpy.mockReturnValue(false);

		const { withSession } = await import('../../src/agentuity/agent');

		const testHandler = async (
			_ctx: any,
			session: { auth: any; org: any; hasScope: (s: string) => boolean },
			_input: string
		) => {
			return {
				hasRead: session.hasScope('read'),
				hasWrite: session.hasScope('write'),
				hasAdmin: session.hasScope('admin'),
				hasDelete: session.hasScope('delete'),
			};
		};

		const wrapped = withSession(testHandler, { optional: true });
		const result = await wrapped(agentContext as any, 'test-input');

		expect(result.hasRead).toBe(true);
		expect(result.hasWrite).toBe(true);
		expect(result.hasAdmin).toBe(true);
		expect(result.hasDelete).toBe(false);
	});

	test('scopes in session take precedence over scopes in user', async () => {
		const agentContext = createMockAgentContext([
			[
				'@agentuity/auth',
				{
					user: { id: 'user-123', scopes: ['user-scope'] },
					session: { id: 'sess-456', scopes: ['session-scope'] },
				},
			],
		]);
		inAgentContextSpy.mockReturnValue(true);
		getAgentContextSpy.mockReturnValue(agentContext);
		inHTTPContextSpy.mockReturnValue(false);

		const { withSession } = await import('../../src/agentuity/agent');

		const testHandler = async (
			_ctx: any,
			session: { auth: any; org: any; hasScope: (s: string) => boolean },
			_input: string
		) => {
			return {
				hasSessionScope: session.hasScope('session-scope'),
				hasUserScope: session.hasScope('user-scope'),
			};
		};

		const wrapped = withSession(testHandler, { optional: true });
		const result = await wrapped(agentContext as any, 'test-input');

		expect(result.hasSessionScope).toBe(true);
		expect(result.hasUserScope).toBe(false);
	});

	test('caches auth in agent state for subsequent calls', async () => {
		const authData = {
			user: { id: 'user-123' },
			session: { id: 'sess-456' },
		};
		const agentContext = createMockAgentContext([['@agentuity/auth', authData]]);
		inAgentContextSpy.mockReturnValue(true);
		getAgentContextSpy.mockReturnValue(agentContext);
		inHTTPContextSpy.mockReturnValue(false);

		const { withSession } = await import('../../src/agentuity/agent');

		const testHandler = async (
			_ctx: any,
			session: { auth: any; org: any; hasScope: (s: string) => boolean },
			_input: string
		) => {
			return { userId: session.auth?.user?.id };
		};

		const wrapped = withSession(testHandler, { optional: true });

		const result1 = await wrapped(agentContext as any, 'test-1');
		const result2 = await wrapped(agentContext as any, 'test-2');

		expect(result1.userId).toBe('user-123');
		expect(result2.userId).toBe('user-123');
	});

	test('returns null org when no active organization', async () => {
		const agentContext = createMockAgentContext([
			[
				'@agentuity/auth',
				{
					user: { id: 'user-123' },
					session: { id: 'sess-456' },
				},
			],
		]);
		inAgentContextSpy.mockReturnValue(true);
		getAgentContextSpy.mockReturnValue(agentContext);
		inHTTPContextSpy.mockReturnValue(false);

		const { withSession } = await import('../../src/agentuity/agent');

		const testHandler = async (
			_ctx: any,
			session: { auth: any; org: any; hasScope: (s: string) => boolean },
			_input: string
		) => {
			return { org: session.org };
		};

		const wrapped = withSession(testHandler, { optional: true });
		const result = await wrapped(agentContext as any, 'test-input');

		expect(result.org).toBeNull();
	});

	test('hasScope returns false when no auth', async () => {
		const agentContext = createMockAgentContext();
		inAgentContextSpy.mockReturnValue(true);
		getAgentContextSpy.mockReturnValue(agentContext);
		inHTTPContextSpy.mockReturnValue(false);

		const { withSession } = await import('../../src/agentuity/agent');

		const testHandler = async (
			_ctx: any,
			session: { auth: any; org: any; hasScope: (s: string) => boolean },
			_input: string
		) => {
			return { hasScope: session.hasScope('any') };
		};

		const wrapped = withSession(testHandler, { optional: true });
		const result = await wrapped(agentContext as any, 'test-input');

		expect(result.hasScope).toBe(false);
	});

	test('handles permissions field as fallback for scopes', async () => {
		const agentContext = createMockAgentContext([
			[
				'@agentuity/auth',
				{
					user: { id: 'user-123' },
					session: { id: 'sess-456', permissions: ['perm1', 'perm2'] },
				},
			],
		]);
		inAgentContextSpy.mockReturnValue(true);
		getAgentContextSpy.mockReturnValue(agentContext);
		inHTTPContextSpy.mockReturnValue(false);

		const { withSession } = await import('../../src/agentuity/agent');

		const testHandler = async (
			_ctx: any,
			session: { auth: any; org: any; hasScope: (s: string) => boolean },
			_input: string
		) => {
			return {
				hasPerm1: session.hasScope('perm1'),
				hasPerm2: session.hasScope('perm2'),
				hasPerm3: session.hasScope('perm3'),
			};
		};

		const wrapped = withSession(testHandler, { optional: true });
		const result = await wrapped(agentContext as any, 'test-input');

		expect(result.hasPerm1).toBe(true);
		expect(result.hasPerm2).toBe(true);
		expect(result.hasPerm3).toBe(false);
	});
});
