/**
 * Tests for ctx.auth lazy binding from HTTP context.
 *
 * Validates that auth middleware running AFTER the agent middleware
 * still propagates auth to agents via the lazy getter.
 */

import { describe, test, expect } from 'bun:test';
import { Hono } from 'hono';
import {
	RequestAgentContext,
	setupRequestAgentContext,
	runInHTTPContext,
	getAgentAsyncLocalStorage,
	type RequestAgentContextArgs,
} from '../src/_context';
import type { AuthInterface } from '@agentuity/auth/types';
import { trace } from '@opentelemetry/api';

// Create a proper mock tracer
const mockTracer = trace.getTracer('test-tracer');

// Helper to create a minimal mock logger
const createMockLogger = () => ({
	trace: () => {},
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
	fatal: () => {},
	child: () => createMockLogger(),
});

// Helper to create mock auth
const createMockAuth = (userId: string): AuthInterface => ({
	user: { id: userId, email: `${userId}@example.com`, name: 'Test User' },
	session: { id: 'session-123', userId },
	authMethod: 'session',
	raw: {},
	getUser: async () => ({ id: userId, email: `${userId}@example.com`, name: 'Test User' }),
	getToken: async () => null,
	getOrg: async () => null,
	getOrgRole: async () => null,
	hasOrgRole: async () => false,
	apiKey: null,
	hasPermission: () => false,
});

describe('Agent Auth Context Lazy Binding', () => {
	test('ctx.auth getter reads from HTTP context when c.var.auth is set later', async () => {
		// This test simulates the real scenario:
		// 1. Agent middleware creates RequestAgentContext (c.var.auth is undefined)
		// 2. Auth middleware sets c.var.auth
		// 3. Agent handler reads ctx.auth (should get the auth set in step 2)

		const app = new Hono();
		let capturedAuth: AuthInterface | null = null;

		app.use('*', async (c, next) => {
			// Wrap in HTTP context (like createBaseMiddleware does)
			await runInHTTPContext(c, next);
		});

		app.use('/api/*', async (c, next) => {
			// Agent middleware runs FIRST - c.var.auth is undefined here
			const args: RequestAgentContextArgs = {
				sessionId: 'test-session',
				agent: {},
				logger: createMockLogger() as any,
				tracer: mockTracer,
				session: { id: 'test-session', state: new Map(), thread: {} as any } as any,
				thread: { id: 'test-thread', state: new Map() } as any,
				handler: { waitUntil: () => {} } as any,
				config: {},
				app: {},
				runtime: {
					agents: new Map(),
					agentConfigs: new Map(),
					agentEventListeners: new WeakMap(),
				},
				auth: c.var.auth ?? null, // This is null at this point!
			};

			return setupRequestAgentContext(c as any, args, next);
		});

		app.use('/api/*', async (c, next) => {
			// Auth middleware runs AFTER agent middleware
			c.set('auth', createMockAuth('late-bound-user'));
			await next();
		});

		app.post('/api/test', async (c) => {
			// Route handler - get the agent context and check auth
			const storage = getAgentAsyncLocalStorage();
			const ctx = storage.getStore();

			if (ctx) {
				capturedAuth = ctx.auth;
			}

			return c.json({
				hasAuth: ctx?.auth !== null,
				userId: ctx?.auth?.user?.id ?? null,
			});
		});

		const res = await app.request('/api/test', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({}),
		});

		expect(res.status).toBe(200);
		const data = await res.json();

		// The key assertion: ctx.auth should have picked up the auth
		// set by the later middleware via the lazy getter
		expect(data.hasAuth).toBe(true);
		expect(data.userId).toBe('late-bound-user');
		expect(capturedAuth).not.toBeNull();
		expect(capturedAuth?.user?.id).toBe('late-bound-user');
	});

	test('ctx.auth falls back to initial value when not in HTTP context', async () => {
		const mockAuth = createMockAuth('standalone-user');

		const ctx = new RequestAgentContext({
			sessionId: 'test-session',
			agent: {},
			logger: createMockLogger() as any,
			tracer: mockTracer,
			session: { id: 'test-session', state: new Map(), thread: {} as any } as any,
			thread: { id: 'test-thread', state: new Map() } as any,
			handler: { waitUntil: () => {} } as any,
			config: {},
			app: {},
			runtime: {
				agents: new Map(),
				agentConfigs: new Map(),
				agentEventListeners: new WeakMap(),
			},
			auth: mockAuth,
		});

		// Not in HTTP context, so should use the initial value
		expect(ctx.auth).not.toBeNull();
		expect(ctx.auth?.user?.id).toBe('standalone-user');
	});

	test('ctx.auth is null when no auth is set anywhere', async () => {
		const ctx = new RequestAgentContext({
			sessionId: 'test-session',
			agent: {},
			logger: createMockLogger() as any,
			tracer: mockTracer,
			session: { id: 'test-session', state: new Map(), thread: {} as any } as any,
			thread: { id: 'test-thread', state: new Map() } as any,
			handler: { waitUntil: () => {} } as any,
			config: {},
			app: {},
			runtime: {
				agents: new Map(),
				agentConfigs: new Map(),
				agentEventListeners: new WeakMap(),
			},
			// No auth passed
		});

		expect(ctx.auth).toBeNull();
	});

	test('ctx.auth setter updates the fallback value', async () => {
		const ctx = new RequestAgentContext({
			sessionId: 'test-session',
			agent: {},
			logger: createMockLogger() as any,
			tracer: mockTracer,
			session: { id: 'test-session', state: new Map(), thread: {} as any } as any,
			thread: { id: 'test-thread', state: new Map() } as any,
			handler: { waitUntil: () => {} } as any,
			config: {},
			app: {},
			runtime: {
				agents: new Map(),
				agentConfigs: new Map(),
				agentEventListeners: new WeakMap(),
			},
		});

		expect(ctx.auth).toBeNull();

		// Set auth via setter
		const mockAuth = createMockAuth('set-via-setter');
		ctx.auth = mockAuth;

		// Should now return the set value (when not in HTTP context)
		expect(ctx.auth).not.toBeNull();
		expect(ctx.auth?.user?.id).toBe('set-via-setter');
	});

	test('HTTP context auth takes precedence over initial auth', async () => {
		const app = new Hono();
		let capturedAuth: AuthInterface | null = null;

		app.use('*', async (c, next) => {
			await runInHTTPContext(c, next);
		});

		app.use('/api/*', async (c, next) => {
			// Agent middleware with initial auth
			const args: RequestAgentContextArgs = {
				sessionId: 'test-session',
				agent: {},
				logger: createMockLogger() as any,
				tracer: mockTracer,
				session: { id: 'test-session', state: new Map(), thread: {} as any } as any,
				thread: { id: 'test-thread', state: new Map() } as any,
				handler: { waitUntil: () => {} } as any,
				config: {},
				app: {},
				runtime: {
					agents: new Map(),
					agentConfigs: new Map(),
					agentEventListeners: new WeakMap(),
				},
				auth: createMockAuth('initial-auth'), // Initial auth
			};

			return setupRequestAgentContext(c as any, args, next);
		});

		app.use('/api/*', async (c, next) => {
			// Auth middleware sets different auth
			c.set('auth', createMockAuth('http-context-auth'));
			await next();
		});

		app.post('/api/test', async (c) => {
			const storage = getAgentAsyncLocalStorage();
			const ctx = storage.getStore();
			capturedAuth = ctx?.auth ?? null;

			return c.json({ userId: ctx?.auth?.user?.id ?? null });
		});

		const res = await app.request('/api/test', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({}),
		});

		expect(res.status).toBe(200);
		const data = await res.json();

		// HTTP context auth should take precedence
		expect(data.userId).toBe('http-context-auth');
		expect(capturedAuth?.user?.id).toBe('http-context-auth');
	});
});
