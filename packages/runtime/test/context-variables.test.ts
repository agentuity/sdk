/**
 * Tests for Hono Context Variables type safety and accessibility.
 * Verifies that all Variables and PrivateVariables are properly typed and accessible.
 */

import { test, expect, describe } from 'bun:test';
import { Hono } from 'hono';
import type { Variables, PrivateVariables, Env } from '../src/app';
import { createMockLogger } from '@agentuity/test-utils';
import { metrics, trace } from '@opentelemetry/api';
import WaitUntilHandler from '../src/_waituntil';
import {
	createMockKeyValueStorage,
	createMockStreamStorage,
	createMockVectorStorage,
} from './helpers/mock-services';

describe('Hono Context Variables - Type Safety', () => {
	test('Variables interface includes all required properties', () => {
		type TestVars = Variables<{ customProp: string }>;

		// Type-level assertions - these verify properties exist at compile time
		// If any property is missing from the type, TypeScript will error
		type _AssertLogger = TestVars['logger'];
		type _AssertMeter = TestVars['meter'];
		type _AssertTracer = TestVars['tracer'];
		type _AssertSessionId = TestVars['sessionId'];
		type _AssertThread = TestVars['thread'];
		type _AssertSession = TestVars['session'];
		type _AssertAgent = TestVars['agent'];
		type _AssertKv = TestVars['kv'];
		type _AssertStream = TestVars['stream'];
		type _AssertVector = TestVars['vector'];
		type _AssertApp = TestVars['app'];

		// Test passes if it compiles
		expect(true).toBe(true);
	});

	test('PrivateVariables interface includes all required properties', () => {
		// Type-level assertions - these verify properties exist at compile time
		type _AssertWaitUntil = PrivateVariables['waitUntilHandler'];
		type _AssertRouteId = PrivateVariables['routeId'];
		type _AssertAgentIds = PrivateVariables['agentIds'];
		type _AssertTrigger = PrivateVariables['trigger'];

		// Test passes if it compiles
		expect(true).toBe(true);
	});

	test('Env extends HonoEnv with Variables', () => {
		// Type-level test only - verifies compilation
		type TestEnv = Env<{ version: string }>;

		// These should compile without errors
		type _CheckVariables = TestEnv['Variables'];
		type _CheckLogger = TestEnv['Variables']['logger'];
		type _CheckApp = TestEnv['Variables']['app'];
		type _CheckVersion = TestEnv['Variables']['app']['version'];

		expect(true).toBe(true);
	});
});

describe('Hono Context Variables - Runtime Access', () => {
	test('context variables are accessible via c.var', async () => {
		const app = new Hono<Env>();

		const logger = createMockLogger();
		const meter = metrics.getMeter('test');
		const tracer = trace.getTracer('test');
		const sessionId = 'test-session-123';
		const kv = createMockKeyValueStorage();
		const stream = createMockStreamStorage();
		const vector = createMockVectorStorage();
		const agent = {};
		const thread = {
			id: 'test-thread',
			state: new Map(),
			addEventListener: () => {},
			removeEventListener: () => {},
			destroy: async () => {},
			empty: () => true,
		};
		const session = {
			id: 'test-session',
			thread,
			state: new Map(),
			addEventListener: () => {},
			removeEventListener: () => {},
			serializeUserData: () => undefined,
		};

		app.use('*', async (c, next) => {
			c.set('logger', logger);
			c.set('meter', meter);
			c.set('tracer', tracer);
			c.set('sessionId', sessionId);
			c.set('kv', kv);
			c.set('stream', stream);
			c.set('vector', vector);
			c.set('agent', agent);
			c.set('thread', thread);
			c.set('session', session);
			c.set('app', {});
			await next();
		});

		app.get('/test', (c) => {
			// Verify all variables are accessible
			expect(c.var.logger).toBe(logger);
			expect(c.var.meter).toBe(meter);
			expect(c.var.tracer).toBe(tracer);
			expect(c.var.sessionId).toBe(sessionId);
			expect(c.var.kv).toBe(kv);
			expect(c.var.stream).toBe(stream);
			expect(c.var.vector).toBe(vector);
			expect(c.var.thread).toBe(thread);
			expect(c.var.session).toBe(session);
			expect(c.var.app).toEqual({});

			return c.json({ success: true });
		});

		const res = await app.request('/test');
		expect(res.status).toBe(200);
	});

	test('logger is accessible and typed correctly', async () => {
		const app = new Hono<Env>();
		const logger = createMockLogger();

		app.use('*', async (c, next) => {
			c.set('logger', logger);
			await next();
		});

		app.get('/log', (c) => {
			// Type-safe access to logger methods
			c.var.logger.info('test message');
			c.var.logger.error('error message');
			c.var.logger.warn('warning message');

			return c.json({ logged: true });
		});

		const res = await app.request('/log');
		expect(res.status).toBe(200);
	});

	test('kv storage is accessible and typed correctly', async () => {
		const app = new Hono<Env>();
		const kv = createMockKeyValueStorage();

		app.use('*', async (c, next) => {
			c.set('kv', kv);
			await next();
		});

		app.post('/kv', async (c) => {
			// Type-safe KV operations
			await c.var.kv.set('test-store', 'key1', 'value1');
			const result = await c.var.kv.get<string>('test-store', 'key1');

			return c.json({
				exists: result.exists,
				value: result.data,
			});
		});

		const res = await app.request('/kv', { method: 'POST' });
		expect(res.status).toBe(200);
		const data = (await res.json()) as { exists: boolean; value: string };
		expect(data.exists).toBe(true);
		expect(data.value).toBe('value1');
	});

	test('stream storage is accessible and typed correctly', async () => {
		const app = new Hono<Env>();
		const stream = createMockStreamStorage();

		app.use('*', async (c, next) => {
			c.set('stream', stream);
			await next();
		});

		app.post('/stream', async (c) => {
			const s = await c.var.stream.create('test-stream');
			await s.write('chunk1');
			await s.write('chunk2');

			return c.json({ streamId: s.id });
		});

		const res = await app.request('/stream', { method: 'POST' });
		expect(res.status).toBe(200);
		const data = (await res.json()) as { streamId: string };
		expect(data.streamId).toMatch(/stream-\d+/);
	});

	test('vector storage is accessible and typed correctly', async () => {
		const app = new Hono<Env>();
		const vector = createMockVectorStorage();

		app.use('*', async (c, next) => {
			c.set('vector', vector);
			await next();
		});

		app.post('/vector', async (c) => {
			await c.var.vector.upsert('vectors1', {
				key: 'doc1',
				document: 'AI content',
				metadata: { topic: 'tech' },
			});
			const result = await c.var.vector.get('vectors1', 'doc1');

			return c.json({ exists: result.exists });
		});

		const res = await app.request('/vector', { method: 'POST' });
		expect(res.status).toBe(200);
		const data = (await res.json()) as { exists: boolean };
		expect(data.exists).toBe(true);
	});

	test('sessionId is accessible', async () => {
		const app = new Hono<Env>();

		app.use('*', async (c, next) => {
			c.set('sessionId', 'session-abc-123');
			await next();
		});

		app.get('/session', (c) => {
			return c.json({ sessionId: c.var.sessionId });
		});

		const res = await app.request('/session');
		const data = (await res.json()) as { sessionId: string };
		expect(data.sessionId).toBe('session-abc-123');
	});

	test('thread is accessible', async () => {
		const app = new Hono<Env>();

		const thread = {
			id: 'thread-xyz',
			state: new Map(),
			addEventListener: () => {},
			removeEventListener: () => {},
			destroy: async () => {},
			empty: () => true,
		};

		app.use('*', async (c, next) => {
			c.set('thread', thread);
			await next();
		});

		app.get('/thread', (c) => {
			return c.json({ threadId: c.var.thread.id });
		});

		const res = await app.request('/thread');
		const data = (await res.json()) as { threadId: string };
		expect(data.threadId).toBe('thread-xyz');
	});

	test('session is accessible', async () => {
		const app = new Hono<Env>();

		const thread = {
			id: 'thread-xyz',
			state: new Map(),
			addEventListener: () => {},
			removeEventListener: () => {},
			destroy: async () => {},
			empty: () => true,
		};

		const session = {
			id: 'session-xyz',
			thread,
			state: new Map(),
			addEventListener: () => {},
			removeEventListener: () => {},
			serializeUserData: () => undefined,
		};

		app.use('*', async (c, next) => {
			c.set('session', session);
			await next();
		});

		app.get('/session-info', (c) => {
			return c.json({
				sessionId: c.var.session.id,
				threadId: c.var.session.thread.id,
			});
		});

		const res = await app.request('/session-info');
		const data = (await res.json()) as { sessionId: string; threadId: string };
		expect(data.sessionId).toBe('session-xyz');
		expect(data.threadId).toBe('thread-xyz');
	});
});

describe('Hono Context Variables - Custom App State', () => {
	test('custom app state is typed correctly', async () => {
		type CustomAppState = {
			database: string;
			version: string;
			config: {
				maxRetries: number;
			};
		};

		const app = new Hono<Env<CustomAppState>>();

		const customState: CustomAppState = {
			database: 'postgres://localhost',
			version: '1.0.0',
			config: {
				maxRetries: 3,
			},
		};

		app.use('*', async (c, next) => {
			c.set('app', customState);
			await next();
		});

		app.get('/app-state', (c) => {
			// Type-safe access to custom app state
			const db = c.var.app.database;
			const ver = c.var.app.version;
			const retries = c.var.app.config.maxRetries;

			return c.json({
				database: db,
				version: ver,
				maxRetries: retries,
			});
		});

		const res = await app.request('/app-state');
		const data = (await res.json()) as { database: string; version: string; maxRetries: number };
		expect(data.database).toBe('postgres://localhost');
		expect(data.version).toBe('1.0.0');
		expect(data.maxRetries).toBe(3);
	});

	test('empty app state defaults to empty object', async () => {
		const app = new Hono<Env>();

		app.use('*', async (c, next) => {
			c.set('app', {});
			await next();
		});

		app.get('/empty', (c) => {
			return c.json({ app: c.var.app });
		});

		const res = await app.request('/empty');
		const data = (await res.json()) as { app: Record<string, never> };
		expect(data.app).toEqual({});
	});
});

describe('Hono Context Variables - PrivateVariables', () => {
	test('private variables are accessible with type casting', async () => {
		type PrivateEnv = {
			Variables: PrivateVariables;
		};

		const app = new Hono<PrivateEnv>();

		const tracer = trace.getTracer('test');
		const waitUntilHandler = new WaitUntilHandler(tracer);

		app.use('*', async (c, next) => {
			c.set('waitUntilHandler', waitUntilHandler);
			c.set('routeId', 'route-123');
			c.set('agentIds', new Set(['agent1', 'agent2']));
			c.set('trigger', 'api' as const);
			await next();
		});

		app.get('/private', (c) => {
			expect(c.var.waitUntilHandler).toBe(waitUntilHandler);
			expect(c.var.routeId).toBe('route-123');
			expect(c.var.agentIds.has('agent1')).toBe(true);
			expect(c.var.trigger).toBe('api');

			return c.json({ success: true });
		});

		const res = await app.request('/private');
		expect(res.status).toBe(200);
	});

	test('agentIds set is mutable', async () => {
		type PrivateEnv = {
			Variables: PrivateVariables;
		};

		const app = new Hono<PrivateEnv>();

		app.use('*', async (c, next) => {
			c.set('agentIds', new Set<string>());
			await next();
		});

		app.post('/add-agent', (c) => {
			c.var.agentIds.add('agent-xyz');
			c.var.agentIds.add('agent-abc');

			return c.json({
				count: c.var.agentIds.size,
				hasXyz: c.var.agentIds.has('agent-xyz'),
			});
		});

		const res = await app.request('/add-agent', { method: 'POST' });
		const data = (await res.json()) as { count: number; hasXyz: boolean };
		expect(data.count).toBe(2);
		expect(data.hasXyz).toBe(true);
	});

	test('trigger type is constrained to TriggerType', async () => {
		type PrivateEnv = {
			Variables: PrivateVariables;
		};

		const app = new Hono<PrivateEnv>();

		app.use('*', async (c, next) => {
			c.set('trigger', 'api' as const);
			await next();
		});

		app.get('/trigger', (c) => {
			const trigger = c.var.trigger;
			// Type is constrained to TriggerType
			return c.json({ trigger });
		});

		const res = await app.request('/trigger');
		const data = (await res.json()) as { trigger: string };
		expect(data.trigger).toBe('api');
	});
});

describe('Hono Context Variables - Integration', () => {
	test('all public and private variables work together', async () => {
		type CombinedEnv = {
			Variables: Variables<{ version: string }> & PrivateVariables;
		};

		const app = new Hono<CombinedEnv>();

		const logger = createMockLogger();
		const kv = createMockKeyValueStorage();

		app.use('*', async (c, next) => {
			// Public variables
			c.set('logger', logger);
			c.set('sessionId', 'session-1');
			c.set('kv', kv);
			c.set('app', { version: '2.0.0' });

			// Private variables
			c.set('routeId', 'route-combined');
			c.set('agentIds', new Set(['agent-combined']));

			await next();
		});

		app.get('/combined', async (c) => {
			// Access both public and private
			c.var.logger.info('Combined test');
			await c.var.kv.set('store', 'key', 'val');
			c.var.agentIds.add('agent-new');

			return c.json({
				sessionId: c.var.sessionId,
				version: c.var.app.version,
				routeId: c.var.routeId,
				agentCount: c.var.agentIds.size,
			});
		});

		const res = await app.request('/combined');
		const data = (await res.json()) as {
			sessionId: string;
			version: string;
			routeId: string;
			agentCount: number;
		};
		expect(data.sessionId).toBe('session-1');
		expect(data.version).toBe('2.0.0');
		expect(data.routeId).toBe('route-combined');
		expect(data.agentCount).toBe(2);
	});
});
