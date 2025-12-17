import { describe, test, expect, mock } from 'bun:test';
import { trace, type Tracer } from '@opentelemetry/api';
import type { Logger } from '../src/logger';

// Create test stubs
const testLogger: Logger = {
	trace: () => {},
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
	fatal: (() => {}) as Logger['fatal'],
	child: () => testLogger,
};

const testTracer: Tracer = trace.getTracer('standalone-test');

const testAppState = {
	testMode: true,
	startTime: Date.now(),
};

// Mock storage services
const mockKv = new Map<string, unknown>();
const mockKvService = {
	async get(key: string) {
		return mockKv.get(key) ?? null;
	},
	async set(key: string, value: unknown) {
		mockKv.set(key, value);
	},
	async delete(key: string) {
		mockKv.delete(key);
	},
	async list() {
		return [];
	},
	async clear() {
		mockKv.clear();
	},
};

const mockStreamService = {
	async create() {
		return { id: 'stream-test' };
	},
	async list() {
		return { streams: [], total: 0 };
	},
	async delete() {},
};

const mockVectorService = {
	async upsert() {
		return [];
	},
	async query() {
		return [];
	},
	async get() {
		return null;
	},
	async delete() {},
};

// Mock providers
const mockThreadProvider = {
	async restore() {
		return {
			id: 'thrd-test',
			state: new Map(),
			addEventListener: () => {},
			removeEventListener: () => {},
			destroy: async () => {},
			empty: () => true,
		};
	},
	async save() {},
	async destroy() {},
};

const mockSessionProvider = {
	async restore(thread: { id: string; state: Map<string, unknown> }, sessionId: string) {
		return {
			id: sessionId,
			thread,
			state: new Map(),
			addEventListener: () => {},
			removeEventListener: () => {},
			serializeUserData: () => undefined,
		};
	},
	async save() {},
};

const mockSessionEventProvider = {
	async start() {},
	async complete() {},
};

// Mock the _server module
mock.module('../src/_server', () => ({
	getLogger: () => testLogger,
	getTracer: () => testTracer,
	getServer: () => null,
	getRouter: () => null,
}));

// Mock the app module
mock.module('../src/app', () => ({
	getAppState: () => testAppState,
	getAppConfig: () => ({}),
}));

// Mock the _services module
mock.module('../src/_services', () => ({
	registerServices: (ctx: { kv?: unknown; stream?: unknown; vector?: unknown }) => {
		ctx.kv = mockKvService;
		ctx.stream = mockStreamService;
		ctx.vector = mockVectorService;
	},
	getServices: () => ({
		kv: mockKvService,
		stream: mockStreamService,
		vector: mockVectorService,
	}),
	getThreadProvider: () => mockThreadProvider,
	getSessionProvider: () => mockSessionProvider,
	getSessionEventProvider: () => mockSessionEventProvider,
	getEvalRunEventProvider: () => ({
		async start() {},
		async complete() {},
	}),
}));

// Now import the code under test
import { createAgentContext } from '../src/_standalone';
import { createAgent } from '../src/agent';
import { s } from '@agentuity/schema';

// Test agents
const simpleAgent = createAgent('simple-test', {
	description: 'Simple test agent',
	schema: {
		input: s.object({
			value: s.string(),
		}),
		output: s.object({
			result: s.string(),
		}),
	},
	handler: async (_ctx, input) => {
		_ctx.logger.info('Processing: %s', input.value);
		return { result: `processed: ${input.value}` };
	},
});

const statusAgent = createAgent('status-test', {
	description: 'Status agent',
	schema: {
		output: s.object({
			status: s.string(),
		}),
	},
	handler: async () => {
		return { status: 'ok' };
	},
});

describe('createAgentContext', () => {
	describe('basic creation', () => {
		test('creates context when globals are available', () => {
			const ctx = createAgentContext<typeof testAppState>();

			expect(ctx.logger).toBe(testLogger);
			expect(ctx.tracer).toBe(testTracer);
			expect(ctx.app.testMode).toBe(true);
			expect(ctx.kv).toBeDefined();
			expect(ctx.stream).toBeDefined();
			expect(ctx.vector).toBeDefined();
		});

		test('accepts custom options', () => {
			const ctx = createAgentContext({
				sessionId: 'custom-123',
				trigger: 'discord',
			});

			expect(ctx).toBeDefined();
		});
	});

	describe('invoke method', () => {
		test('executes agent successfully', async () => {
			const ctx = createAgentContext();
			const result = await ctx.invoke(() => simpleAgent.run({ value: 'test' }));

			expect(result.result).toBe('processed: test');
		});

		test('executes agent without input', async () => {
			const ctx = createAgentContext();
			const result = await ctx.invoke(() => statusAgent.run());

			expect(result.status).toBe('ok');
		});

		test('handles agent errors', async () => {
			const errorAgent = createAgent('error', {
				schema: {
					output: s.object({ result: s.string() }),
				},
				handler: async () => {
					throw new Error('Test error');
				},
			});

			const ctx = createAgentContext();
			await expect(ctx.invoke(() => errorAgent.run())).rejects.toThrow('Test error');
		});

		test('provides proper sessionId to agent', async () => {
			let capturedSessionId: string | undefined;

			const captureAgent = createAgent('capture', {
				schema: {
					output: s.object({ sessionId: s.string() }),
				},
				handler: async (ctx) => {
					capturedSessionId = ctx.sessionId;
					return { sessionId: ctx.sessionId };
				},
			});

			const ctx = createAgentContext();
			const result = await ctx.invoke(() => captureAgent.run());

			expect(capturedSessionId).toBeDefined();
			expect(capturedSessionId).toMatch(/^sess_/);
			expect(result.sessionId).toMatch(/^sess_/);
		});

		test('uses custom sessionId when provided', async () => {
			const customId = 'custom-session-123';
			let capturedSessionId: string | undefined;

			const captureAgent = createAgent('capture', {
				schema: {
					output: s.object({ sessionId: s.string() }),
				},
				handler: async (ctx) => {
					capturedSessionId = ctx.sessionId;
					return { sessionId: ctx.sessionId };
				},
			});

			const ctx = createAgentContext({ sessionId: customId });
			const result = await ctx.invoke(() => captureAgent.run());

			expect(capturedSessionId).toBe(customId);
			expect(result.sessionId).toBe(customId);
		});

		test('handles concurrent invocations safely', async () => {
			const ctx = createAgentContext();

			const [r1, r2, r3] = await Promise.all([
				ctx.invoke(() => simpleAgent.run({ value: 'one' })),
				ctx.invoke(() => simpleAgent.run({ value: 'two' })),
				ctx.invoke(() => simpleAgent.run({ value: 'three' })),
			]);

			expect(r1.result).toBe('processed: one');
			expect(r2.result).toBe('processed: two');
			expect(r3.result).toBe('processed: three');
		});
	});

	describe('infrastructure integration', () => {
		test('context provides logger', async () => {
			const ctx = createAgentContext();

			await ctx.invoke(async (_ctx) => {
				expect(ctx.logger).toBeDefined();
				expect(() => {
					ctx.logger.info('test');
					ctx.logger.debug('test');
				}).not.toThrow();

				return statusAgent.run();
			});
		});

		test('context provides app state', async () => {
			const ctx = createAgentContext<typeof testAppState>();

			await ctx.invoke(async (_ctx) => {
				expect(ctx.app).toBeDefined();
				expect(ctx.app.testMode).toBe(true);

				return statusAgent.run();
			});
		});

		test('context provides storage services', async () => {
			const ctx = createAgentContext();

			await ctx.invoke(async (_ctx) => {
				expect(ctx.kv).toBeDefined();
				expect(ctx.stream).toBeDefined();
				expect(ctx.vector).toBeDefined();

				return statusAgent.run();
			});
		});
	});
});
