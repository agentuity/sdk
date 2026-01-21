import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Writable } from 'node:stream';
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

		test('should create sandbox with projectId', async () => {
			mockFetch(async (url, opts) => {
				if (opts?.method === 'POST') {
					const body = JSON.parse(opts.body as string);
					expect(body.projectId).toBe('proj_123');

					return new Response(
						JSON.stringify({
							success: true,
							data: {
								sandboxId: 'sandbox-789',
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
				projectId: 'proj_123',
			});

			expect(sandbox.id).toBe('sandbox-789');
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

		test('execute with pipe should handle backpressure and receive all chunks', async () => {
			const chunks = [
				new Uint8Array([72, 101, 108, 108, 111]), // "Hello"
				new Uint8Array([32, 87, 111, 114, 108, 100]), // " World"
				new Uint8Array([33, 10]), // "!\n"
			];
			const receivedChunks: Buffer[] = [];

			const slowWritable = new Writable({
				highWaterMark: 1,
				write(chunk, _encoding, callback) {
					receivedChunks.push(Buffer.from(chunk));
					setTimeout(callback, 5);
				},
			});

			mockFetch(async (url, opts) => {
				// Execute endpoint - must check before /sandbox/ since it also contains /sandbox/
				if (opts?.method === 'POST' && url.includes('/execute')) {
					return new Response(
						JSON.stringify({
							success: true,
							data: {
								executionId: 'exec-pipe-test',
								status: 'queued',
								stdoutStreamUrl: 'https://stream.example.com/stdout/exec-pipe-test',
								stderrStreamUrl: 'https://stream.example.com/stderr/exec-pipe-test',
							},
						}),
						{ status: 200, headers: { 'content-type': 'application/json' } }
					);
				}

				// Sandbox create endpoint
				if (opts?.method === 'POST' && url.includes('/sandbox/')) {
					return new Response(
						JSON.stringify({
							success: true,
							data: {
								sandboxId: 'sandbox-pipe-test',
								status: 'idle',
								stdoutStreamUrl: 'https://stream.example.com/stdout',
								stderrStreamUrl: 'https://stream.example.com/stderr',
							},
						}),
						{ status: 200, headers: { 'content-type': 'application/json' } }
					);
				}

				// Stream endpoint
				if (url.includes('stream.example.com/stdout')) {
					let chunkIndex = 0;
					const stream = new ReadableStream({
						pull(controller) {
							if (chunkIndex < chunks.length) {
								controller.enqueue(chunks[chunkIndex++]);
							} else {
								controller.close();
							}
						},
					});
					return new Response(stream, { status: 200 });
				}

				// Execution status endpoint
				if (opts?.method === 'GET' && url.includes('/execution/exec-pipe-test')) {
					return new Response(
						JSON.stringify({
							success: true,
							data: {
								executionId: 'exec-pipe-test',
								sandboxId: 'sandbox-pipe-test',
								status: 'completed',
								exitCode: 0,
								durationMs: 100,
							},
						}),
						{ status: 200, headers: { 'content-type': 'application/json' } }
					);
				}

				return new Response(null, { status: 404 });
			});

			const client = new SandboxClient({ logger: createMockLogger() });
			const sandbox = await client.create();
			const result = await sandbox.execute({
				command: ['echo', 'Hello World!'],
				pipe: { stdout: slowWritable },
			});

			expect(result.status).toBe('completed');
			expect(result.exitCode).toBe(0);
			expect(receivedChunks.length).toBe(3);
			const fullOutput = Buffer.concat(receivedChunks).toString();
			expect(fullOutput).toBe('Hello World!\n');
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
								org: { id: 'org-123', name: 'Test Org' },
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

	describe('run', () => {
		test('should have run method available', () => {
			const client = new SandboxClient({ logger: createMockLogger() });
			expect(typeof client.run).toBe('function');
		});

		test('should throw error when stdin provided without API key', async () => {
			delete process.env.AGENTUITY_SDK_KEY;
			delete process.env.AGENTUITY_CLI_KEY;

			const client = new SandboxClient({ logger: createMockLogger() });
			const { Readable } = await import('node:stream');
			const stdin = new Readable({ read() {} });

			await expect(client.run({ command: { exec: ['cat'] } }, { stdin })).rejects.toThrow(
				'SandboxClient.run(): stdin streaming requires an API key'
			);
		});

		test('should call sandbox create API with oneshot mode', async () => {
			let createCalled = false;
			let createBody: Record<string, unknown> | null = null;

			mockFetch(async (url, opts) => {
				if (opts?.method === 'POST' && url.includes('/sandbox/')) {
					createCalled = true;
					createBody = JSON.parse(opts.body as string);
					return new Response(
						JSON.stringify({
							success: true,
							data: {
								sandboxId: 'sandbox-run-123',
								status: 'running',
							},
						}),
						{ status: 200, headers: { 'content-type': 'application/json' } }
					);
				}

				if (opts?.method === 'GET' && url.includes('sandbox-run-123')) {
					return new Response(
						JSON.stringify({
							success: true,
							data: {
								sandboxId: 'sandbox-run-123',
								status: 'terminated',
							},
						}),
						{ status: 200, headers: { 'content-type': 'application/json' } }
					);
				}

				return new Response(null, { status: 404 });
			});

			const client = new SandboxClient({ logger: createMockLogger() });

			const abortController = new AbortController();
			setTimeout(() => abortController.abort(), 100);

			try {
				await client.run(
					{ command: { exec: ['echo', 'hello'] } },
					{ signal: abortController.signal }
				);
			} catch {
				// Expected to be aborted
			}

			expect(createCalled).toBe(true);
			expect((createBody?.command as Record<string, unknown>)?.mode).toBe('oneshot');
			expect((createBody?.command as Record<string, unknown>)?.exec).toEqual(['echo', 'hello']);
		});

		test('should return actual exit code from sandbox info', async () => {
			mockFetch(async (url, opts) => {
				if (opts?.method === 'POST' && url.includes('/sandbox/')) {
					return new Response(
						JSON.stringify({
							success: true,
							data: {
								sandboxId: 'sandbox-exit-test',
								status: 'running',
							},
						}),
						{ status: 200, headers: { 'content-type': 'application/json' } }
					);
				}

				if (opts?.method === 'GET' && url.includes('sandbox-exit-test')) {
					return new Response(
						JSON.stringify({
							success: true,
							data: {
								sandboxId: 'sandbox-exit-test',
								status: 'terminated',
								exitCode: 42,
								executions: 1,
								createdAt: '2025-01-01T00:00:00Z',
								org: { id: 'org-123', name: 'Test Org' },
							},
						}),
						{ status: 200, headers: { 'content-type': 'application/json' } }
					);
				}

				return new Response(null, { status: 404 });
			});

			const client = new SandboxClient({ logger: createMockLogger() });
			const result = await client.run({ command: { exec: ['exit', '42'] } });

			expect(result.sandboxId).toBe('sandbox-exit-test');
			expect(result.exitCode).toBe(42);
		});

		test('should return exit code 1 for failed sandbox without explicit exit code', async () => {
			mockFetch(async (url, opts) => {
				if (opts?.method === 'POST' && url.includes('/sandbox/')) {
					return new Response(
						JSON.stringify({
							success: true,
							data: {
								sandboxId: 'sandbox-fail-test',
								status: 'running',
							},
						}),
						{ status: 200, headers: { 'content-type': 'application/json' } }
					);
				}

				if (opts?.method === 'GET' && url.includes('sandbox-fail-test')) {
					return new Response(
						JSON.stringify({
							success: true,
							data: {
								sandboxId: 'sandbox-fail-test',
								status: 'failed',
								executions: 1,
								createdAt: '2025-01-01T00:00:00Z',
								org: { id: 'org-123', name: 'Test Org' },
							},
						}),
						{ status: 200, headers: { 'content-type': 'application/json' } }
					);
				}

				return new Response(null, { status: 404 });
			});

			const client = new SandboxClient({ logger: createMockLogger() });
			const result = await client.run({ command: { exec: ['false'] } });

			expect(result.sandboxId).toBe('sandbox-fail-test');
			expect(result.exitCode).toBe(1);
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
								org: { id: 'org-123', name: 'Test Org' },
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
