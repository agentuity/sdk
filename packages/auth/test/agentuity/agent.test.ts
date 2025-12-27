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

		const testHandler = async (_ctx: any, session: { auth: any; org: any }, input: string) => {
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

		const testHandler = async (_ctx: any, session: { auth: any; org: any }, input: string) => {
			return { input, auth: session.auth, org: session.org };
		};

		const wrapped = withSession(testHandler, { optional: true });
		const result = await wrapped(agentContext as any, 'test-input');

		expect(result.input).toBe('test-input');
		expect(result.auth).toBeNull();
		expect(result.org).toBeNull();
	});

	test('extracts auth from cached state', async () => {
		const authData = {
			user: { id: 'user-123', email: 'test@example.com' },
			session: { id: 'sess-456' },
		};
		const agentContext = createMockAgentContext([['@agentuity/auth', authData]]);
		inAgentContextSpy.mockReturnValue(true);
		getAgentContextSpy.mockReturnValue(agentContext);
		inHTTPContextSpy.mockReturnValue(false);

		const { withSession } = await import('../../src/agentuity/agent');

		const testHandler = async (_ctx: any, session: { auth: any; org: any }, _input: string) => {
			return {
				userId: session.auth?.user?.id,
				email: session.auth?.user?.email,
			};
		};

		const wrapped = withSession(testHandler, { optional: true });
		const result = await wrapped(agentContext as any, 'test-input');

		expect(result.userId).toBe('user-123');
		expect(result.email).toBe('test@example.com');
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

		const testHandler = async (_ctx: any, session: { auth: any; org: any }, _input: string) => {
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

		const testHandler = async (_ctx: any, session: { auth: any; org: any }, _input: string) => {
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

		const testHandler = async (_ctx: any, session: { auth: any; org: any }, _input: string) => {
			return { org: session.org };
		};

		const wrapped = withSession(testHandler, { optional: true });
		const result = await wrapped(agentContext as any, 'test-input');

		expect(result.org).toBeNull();
	});

	test('extracts auth from HTTP context when available', async () => {
		const agentContext = createMockAgentContext();
		inAgentContextSpy.mockReturnValue(true);
		getAgentContextSpy.mockReturnValue(agentContext);
		inHTTPContextSpy.mockReturnValue(true);
		getHTTPContextSpy.mockReturnValue({
			var: {
				auth: {
					raw: {
						user: { id: 'http-user-123', email: 'http@example.com' },
						session: { id: 'http-sess' },
					},
				},
			},
		});

		const { withSession } = await import('../../src/agentuity/agent');

		const testHandler = async (_ctx: any, session: { auth: any; org: any }, _input: string) => {
			return {
				userId: session.auth?.user?.id,
				email: session.auth?.user?.email,
			};
		};

		const wrapped = withSession(testHandler, { optional: true });
		const result = await wrapped(agentContext as any, 'test-input');

		expect(result.userId).toBe('http-user-123');
		expect(result.email).toBe('http@example.com');
	});

	test('falls back to raw user/session when auth.raw not present', async () => {
		const agentContext = createMockAgentContext();
		inAgentContextSpy.mockReturnValue(true);
		getAgentContextSpy.mockReturnValue(agentContext);
		inHTTPContextSpy.mockReturnValue(true);
		getHTTPContextSpy.mockReturnValue({
			var: {
				user: { id: 'fallback-user', email: 'fallback@example.com' },
				session: { id: 'fallback-sess' },
			},
		});

		const { withSession } = await import('../../src/agentuity/agent');

		const testHandler = async (_ctx: any, session: { auth: any; org: any }, _input: string) => {
			return {
				userId: session.auth?.user?.id,
				email: session.auth?.user?.email,
			};
		};

		const wrapped = withSession(testHandler, { optional: true });
		const result = await wrapped(agentContext as any, 'test-input');

		expect(result.userId).toBe('fallback-user');
		expect(result.email).toBe('fallback@example.com');
	});
});
