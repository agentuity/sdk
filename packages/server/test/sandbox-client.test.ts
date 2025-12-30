import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { SandboxClient } from '../src/api/sandbox/client';
import { createMockLogger, mockFetch } from '@agentuity/test-utils';

describe('SandboxClient', () => {
	const originalEnv = { ...process.env };

	beforeEach(() => {
		process.env.AGENTUITY_SDK_KEY = 'test-sdk-key';
		process.env.AGENTUITY_STREAM_URL = 'https://sandbox.example.com';
	});

	afterEach(() => {
		process.env = { ...originalEnv };
	});

	test('should create client with default env vars', () => {
		const client = new SandboxClient();
		expect(client).toBeDefined();
	});

	test('should create client with explicit options', () => {
		const client = new SandboxClient({
			apiKey: 'custom-key',
			url: 'https://custom.example.com',
			logger: createMockLogger(),
		});
		expect(client).toBeDefined();
	});

	test('should use regional fallback when no URL env vars are set', () => {
		delete process.env.AGENTUITY_STREAM_URL;
		delete process.env.AGENTUITY_CATALYST_URL;
		delete process.env.AGENTUITY_TRANSPORT_URL;
		delete process.env.AGENTUITY_SANDBOX_URL;

		const client = new SandboxClient();
		expect(client).toBeDefined();
	});

	test('should fallback to AGENTUITY_CLI_KEY', () => {
		delete process.env.AGENTUITY_SDK_KEY;
		process.env.AGENTUITY_CLI_KEY = 'cli-key';

		const client = new SandboxClient();
		expect(client).toBeDefined();
	});

	test('should fallback to AGENTUITY_CATALYST_URL', () => {
		delete process.env.AGENTUITY_STREAM_URL;
		process.env.AGENTUITY_CATALYST_URL = 'https://catalyst.example.com';

		const client = new SandboxClient();
		expect(client).toBeDefined();
	});

	test('should fallback to AGENTUITY_TRANSPORT_URL', () => {
		delete process.env.AGENTUITY_STREAM_URL;
		delete process.env.AGENTUITY_CATALYST_URL;
		process.env.AGENTUITY_TRANSPORT_URL = 'https://transport.example.com';

		const client = new SandboxClient();
		expect(client).toBeDefined();
	});

	describe('create', () => {
		test('should create a sandbox and return instance with methods', async () => {
			mockFetch(async (url, opts) => {
				if (opts?.method === 'POST' && url.includes('/sandbox/')) {
					return new Response(
						JSON.stringify({
							success: true,
							data: {
								sandboxId: 'sandbox-123',
								status: 'idle',
								stdoutStreamUrl: 'https://stream.example.com/stdout',
								stderrStreamUrl: 'https://stream.example.com/stderr',
							},
						}),
						{ status: 200, headers: { 'content-type': 'application/json' } }
					);
				}
				return new Response(null, { status: 404 });
			});

			const client = new SandboxClient({ logger: createMockLogger() });
			const sandbox = await client.create();

			expect(sandbox.id).toBe('sandbox-123');
			expect(sandbox.status).toBe('idle');
			expect(sandbox.stdoutStreamUrl).toBe('https://stream.example.com/stdout');
			expect(sandbox.stderrStreamUrl).toBe('https://stream.example.com/stderr');
			expect(typeof sandbox.execute).toBe('function');
			expect(typeof sandbox.get).toBe('function');
			expect(typeof sandbox.destroy).toBe('function');
		});

		test('should create sandbox with options', async () => {
			mockFetch(async (url, opts) => {
				if (opts?.method === 'POST') {
					const body = JSON.parse(opts.body as string);
					expect(body.resources?.memory).toBe('1Gi');
					expect(body.env?.NODE_ENV).toBe('test');

					return new Response(
						JSON.stringify({
							success: true,
							data: {
								sandboxId: 'sandbox-456',
								status: 'creating',
							},
						}),
						{ status: 200, headers: { 'content-type': 'application/json' } }
					);
				}
				return new Response(null, { status: 404 });
			});

			const client = new SandboxClient({ logger: createMockLogger() });
			const sandbox = await client.create({
				resources: { memory: '1Gi' },
				env: { NODE_ENV: 'test' },
			});

			expect(sandbox.id).toBe('sandbox-456');
		});
	});

	describe('sandbox instance methods', () => {
		test('execute should call sandbox execute API', async () => {
			let executeCalled = false;

			mockFetch(async (url, opts) => {
				if (opts?.method === 'POST' && url.includes('/execute')) {
					executeCalled = true;
					const body = JSON.parse(opts.body as string);
					expect(body.command).toEqual(['echo', 'hello']);

					return new Response(
						JSON.stringify({
							success: true,
							data: {
								executionId: 'exec-789',
								status: 'queued',
							},
						}),
						{ status: 200, headers: { 'content-type': 'application/json' } }
					);
				}

				if (opts?.method === 'GET' && url.includes('/execution/exec-789')) {
					return new Response(
						JSON.stringify({
							success: true,
							data: {
								executionId: 'exec-789',
								sandboxId: 'sandbox-123',
								status: 'completed',
								exitCode: 0,
								durationMs: 150,
							},
						}),
						{ status: 200, headers: { 'content-type': 'application/json' } }
					);
				}

				if (opts?.method === 'POST' && url.includes('/sandbox/')) {
					return new Response(
						JSON.stringify({
							success: true,
							data: { sandboxId: 'sandbox-123', status: 'idle' },
						}),
						{ status: 200, headers: { 'content-type': 'application/json' } }
					);
				}

				return new Response(null, { status: 404 });
			});

			const client = new SandboxClient({ logger: createMockLogger() });
			const sandbox = await client.create();
			const result = await sandbox.execute({ command: ['echo', 'hello'] });

			expect(executeCalled).toBe(true);
			expect(result.executionId).toBe('exec-789');
			expect(result.status).toBe('completed');
			expect(result.exitCode).toBe(0);
		});

		test('get should call sandbox get API', async () => {
			let getCalled = false;

			mockFetch(async (url, opts) => {
				if (
					opts?.method === 'GET' &&
					url.includes('/sandbox/') &&
					url.includes('sandbox-123')
				) {
					getCalled = true;
					return new Response(
						JSON.stringify({
							success: true,
							data: {
								sandboxId: 'sandbox-123',
								status: 'running',
								createdAt: '2025-01-01T00:00:00Z',
								executions: 5,
							},
						}),
						{ status: 200, headers: { 'content-type': 'application/json' } }
					);
				}

				if (opts?.method === 'POST' && url.includes('/sandbox/')) {
					return new Response(
						JSON.stringify({
							success: true,
							data: { sandboxId: 'sandbox-123', status: 'idle' },
						}),
						{ status: 200, headers: { 'content-type': 'application/json' } }
					);
				}

				return new Response(null, { status: 404 });
			});

			const client = new SandboxClient({ logger: createMockLogger() });
			const sandbox = await client.create();
			const info = await sandbox.get();

			expect(getCalled).toBe(true);
			expect(info.sandboxId).toBe('sandbox-123');
			expect(info.status).toBe('running');
			expect(info.executions).toBe(5);
		});

		test('destroy should call sandbox destroy API', async () => {
			let destroyCalled = false;

			mockFetch(async (url, opts) => {
				if (opts?.method === 'DELETE' && url.includes('sandbox-123')) {
					destroyCalled = true;
					return new Response(JSON.stringify({ success: true }), {
						status: 200,
						headers: { 'content-type': 'application/json' },
					});
				}

				if (opts?.method === 'POST' && url.includes('/sandbox/')) {
					return new Response(
						JSON.stringify({
							success: true,
							data: { sandboxId: 'sandbox-123', status: 'idle' },
						}),
						{ status: 200, headers: { 'content-type': 'application/json' } }
					);
				}

				return new Response(null, { status: 404 });
			});

			const client = new SandboxClient({ logger: createMockLogger() });
			const sandbox = await client.create();
			await sandbox.destroy();

			expect(destroyCalled).toBe(true);
		});
	});

	describe('client direct methods', () => {
		test('get should fetch sandbox by ID', async () => {
			mockFetch(async (url, opts) => {
				if (opts?.method === 'GET' && url.includes('sandbox-abc')) {
					return new Response(
						JSON.stringify({
							success: true,
							data: {
								sandboxId: 'sandbox-abc',
								status: 'idle',
								createdAt: '2025-01-01T00:00:00Z',
								executions: 0,
							},
						}),
						{ status: 200, headers: { 'content-type': 'application/json' } }
					);
				}
				return new Response(null, { status: 404 });
			});

			const client = new SandboxClient({ logger: createMockLogger() });
			const info = await client.get('sandbox-abc');

			expect(info.sandboxId).toBe('sandbox-abc');
		});

		test('destroy should delete sandbox by ID', async () => {
			let destroyCalled = false;

			mockFetch(async (url, opts) => {
				if (opts?.method === 'DELETE' && url.includes('sandbox-xyz')) {
					destroyCalled = true;
					return new Response(JSON.stringify({ success: true }), {
						status: 200,
						headers: { 'content-type': 'application/json' },
					});
				}
				return new Response(null, { status: 404 });
			});

			const client = new SandboxClient({ logger: createMockLogger() });
			await client.destroy('sandbox-xyz');

			expect(destroyCalled).toBe(true);
		});
	});
});
