import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Writable } from 'node:stream';
import { SandboxClient } from '../src/api/sandbox/client.ts';
import { APIClient } from '../src/api/api.ts';
import { sandboxPause } from '../src/api/sandbox/pause.ts';
import { sandboxResume } from '../src/api/sandbox/resume.ts';
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
				if (opts?.method === 'POST' && url.includes('/sandbox')) {
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
			mockFetch(async (_url, opts) => {
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
			mockFetch(async (_url, opts) => {
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

		test('should create sandbox with top-level files', async () => {
			let requestBody: Record<string, unknown> | null = null;

			mockFetch(async (_url, opts) => {
				if (opts?.method === 'POST') {
					requestBody = JSON.parse(opts.body as string);
					return new Response(
						JSON.stringify({
							success: true,
							data: {
								sandboxId: 'sandbox-files',
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
				files: [
					{ path: 'index.ts', content: Buffer.from('console.log("hello")') },
					{ path: 'config.json', content: Buffer.from('{"port": 3000}') },
				],
			});

			expect(sandbox.id).toBe('sandbox-files');
			expect(requestBody).not.toBeNull();
			expect(requestBody!.files).toEqual([
				{ path: 'index.ts', content: Buffer.from('console.log("hello")').toString('base64') },
				{
					path: 'config.json',
					content: Buffer.from('{"port": 3000}').toString('base64'),
				},
			]);
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

				if (opts?.method === 'POST' && url.includes('/sandbox')) {
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

		test('execute with files should send files as map in request body', async () => {
			let requestBody: Record<string, unknown> | null = null;

			mockFetch(async (url, opts) => {
				if (opts?.method === 'POST' && url.includes('/execute')) {
					requestBody = JSON.parse(opts.body as string);
					return new Response(
						JSON.stringify({
							success: true,
							data: {
								executionId: 'exec-files-test',
								status: 'queued',
							},
						}),
						{ status: 200, headers: { 'content-type': 'application/json' } }
					);
				}

				if (opts?.method === 'GET' && url.includes('/execution/exec-files-test')) {
					return new Response(
						JSON.stringify({
							success: true,
							data: {
								executionId: 'exec-files-test',
								sandboxId: 'sandbox-123',
								status: 'completed',
								exitCode: 0,
								durationMs: 100,
							},
						}),
						{ status: 200, headers: { 'content-type': 'application/json' } }
					);
				}

				if (opts?.method === 'POST' && url.includes('/sandbox')) {
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
			await sandbox.execute({
				command: ['bun', 'run', 'script.ts'],
				files: [
					{ path: 'script.ts', content: Buffer.from('console.log("hello")') },
					{ path: 'data.json', content: Buffer.from('{"key": "value"}') },
				],
			});

			expect(requestBody).not.toBeNull();
			expect(requestBody!.command).toEqual(['bun', 'run', 'script.ts']);
			expect(requestBody!.files).toEqual([
				{ path: 'script.ts', content: Buffer.from('console.log("hello")').toString('base64') },
				{ path: 'data.json', content: Buffer.from('{"key": "value"}').toString('base64') },
			]);
		});

		test('execute with empty files array should not include files in request', async () => {
			let requestBody: Record<string, unknown> | null = null;

			mockFetch(async (url, opts) => {
				if (opts?.method === 'POST' && url.includes('/execute')) {
					requestBody = JSON.parse(opts.body as string);
					return new Response(
						JSON.stringify({
							success: true,
							data: {
								executionId: 'exec-empty-files',
								status: 'queued',
							},
						}),
						{ status: 200, headers: { 'content-type': 'application/json' } }
					);
				}

				if (opts?.method === 'GET' && url.includes('/execution/exec-empty-files')) {
					return new Response(
						JSON.stringify({
							success: true,
							data: {
								executionId: 'exec-empty-files',
								sandboxId: 'sandbox-123',
								status: 'completed',
								exitCode: 0,
							},
						}),
						{ status: 200, headers: { 'content-type': 'application/json' } }
					);
				}

				if (opts?.method === 'POST' && url.includes('/sandbox')) {
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
			await sandbox.execute({
				command: ['echo', 'hello'],
				files: [],
			});

			expect(requestBody).not.toBeNull();
			expect(requestBody!.command).toEqual(['echo', 'hello']);
			expect(requestBody!.files).toBeUndefined();
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
				// Execute endpoint - must check before /sandbox since it also contains /sandbox
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
				if (opts?.method === 'POST' && url.includes('/sandbox')) {
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

		test('execute should retry long-poll when execution is still running', async () => {
			let pollCount = 0;

			mockFetch(async (url, opts) => {
				if (opts?.method === 'POST' && url.includes('/execute')) {
					return new Response(
						JSON.stringify({
							success: true,
							data: {
								executionId: 'exec-longpoll',
								status: 'queued',
							},
						}),
						{ status: 200, headers: { 'content-type': 'application/json' } }
					);
				}

				if (opts?.method === 'GET' && url.includes('/execution/exec-longpoll')) {
					pollCount++;
					// First two polls return 'running', third returns 'completed'
					if (pollCount < 3) {
						return new Response(
							JSON.stringify({
								success: true,
								data: {
									executionId: 'exec-longpoll',
									sandboxId: 'sandbox-123',
									status: 'running',
								},
							}),
							{ status: 200, headers: { 'content-type': 'application/json' } }
						);
					}
					return new Response(
						JSON.stringify({
							success: true,
							data: {
								executionId: 'exec-longpoll',
								sandboxId: 'sandbox-123',
								status: 'completed',
								exitCode: 0,
								durationMs: 310000,
							},
						}),
						{ status: 200, headers: { 'content-type': 'application/json' } }
					);
				}

				if (opts?.method === 'POST' && url.includes('/sandbox')) {
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
			const result = await sandbox.execute({ command: ['sleep', '300'] });

			expect(pollCount).toBe(3);
			expect(result.status).toBe('completed');
			expect(result.exitCode).toBe(0);
			expect(result.durationMs).toBe(310000);
		});

		test('execute should return immediately when execution completes on first poll', async () => {
			let pollCount = 0;

			mockFetch(async (url, opts) => {
				if (opts?.method === 'POST' && url.includes('/execute')) {
					return new Response(
						JSON.stringify({
							success: true,
							data: {
								executionId: 'exec-fast',
								status: 'queued',
							},
						}),
						{ status: 200, headers: { 'content-type': 'application/json' } }
					);
				}

				if (opts?.method === 'GET' && url.includes('/execution/exec-fast')) {
					pollCount++;
					return new Response(
						JSON.stringify({
							success: true,
							data: {
								executionId: 'exec-fast',
								sandboxId: 'sandbox-123',
								status: 'completed',
								exitCode: 0,
								durationMs: 50,
							},
						}),
						{ status: 200, headers: { 'content-type': 'application/json' } }
					);
				}

				if (opts?.method === 'POST' && url.includes('/sandbox')) {
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
			const result = await sandbox.execute({ command: ['echo', 'fast'] });

			expect(pollCount).toBe(1);
			expect(result.status).toBe('completed');
			expect(result.exitCode).toBe(0);
		});

		test('execute should handle failed terminal state from long-poll', async () => {
			mockFetch(async (url, opts) => {
				if (opts?.method === 'POST' && url.includes('/execute')) {
					return new Response(
						JSON.stringify({
							success: true,
							data: {
								executionId: 'exec-fail',
								status: 'queued',
							},
						}),
						{ status: 200, headers: { 'content-type': 'application/json' } }
					);
				}

				if (opts?.method === 'GET' && url.includes('/execution/exec-fail')) {
					return new Response(
						JSON.stringify({
							success: true,
							data: {
								executionId: 'exec-fail',
								sandboxId: 'sandbox-123',
								status: 'failed',
								exitCode: 1,
								durationMs: 5000,
							},
						}),
						{ status: 200, headers: { 'content-type': 'application/json' } }
					);
				}

				if (opts?.method === 'POST' && url.includes('/sandbox')) {
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
			const result = await sandbox.execute({ command: ['false'] });

			expect(result.status).toBe('failed');
			expect(result.exitCode).toBe(1);
		});

		test('readFile should throw SandboxResponseError with context on 500', async () => {
			mockFetch(async (url, opts) => {
				if (opts?.method === 'POST' && url.includes('/sandbox')) {
					return new Response(
						JSON.stringify({
							success: true,
							data: { sandboxId: 'sandbox-rf-500', status: 'idle' },
						}),
						{ status: 200, headers: { 'content-type': 'application/json' } }
					);
				}

				if (url.includes('/fs/sandbox-rf-500')) {
					return new Response('Internal Server Error', {
						status: 500,
						headers: { 'x-session-id': 'sess-trace-123' },
					});
				}

				return new Response(null, { status: 404 });
			});

			const client = new SandboxClient({ logger: createMockLogger() });
			const sandbox = await client.create();

			try {
				await sandbox.readFile('/tmp/test.txt');
				expect(true).toBe(false); // should not reach
			} catch (error) {
				// With the raw response fix, sandboxReadFile now gets the response
				// and throws SandboxResponseError with context
				expect((error as { _tag?: string })._tag).toBe('SandboxResponseError');
				expect((error as { sandboxId?: string }).sandboxId).toBe('sandbox-rf-500');
				expect((error as { message?: string }).message).toContain('/tmp/test.txt');
			}
		});

		test('readFile should return stream on success', async () => {
			const fileContent = new Uint8Array([72, 101, 108, 108, 111]); // Hello

			mockFetch(async (url, opts) => {
				if (opts?.method === 'POST' && url.includes('/sandbox')) {
					return new Response(
						JSON.stringify({
							success: true,
							data: { sandboxId: 'sandbox-rf-ok', status: 'idle' },
						}),
						{ status: 200, headers: { 'content-type': 'application/json' } }
					);
				}

				if (url.includes('/fs/sandbox-rf-ok')) {
					return new Response(fileContent, {
						status: 200,
						headers: {
							'content-type': 'application/octet-stream',
							'content-length': String(fileContent.length),
						},
					});
				}

				return new Response(null, { status: 404 });
			});

			const client = new SandboxClient({ logger: createMockLogger() });
			const sandbox = await client.create();
			const stream = await sandbox.readFile('/tmp/test.txt');

			expect(stream).toBeDefined();
			const reader = stream.getReader();
			const { value } = await reader.read();
			expect(Buffer.from(value!).toString()).toBe('Hello');
		});

		test('get should call sandbox get API', async () => {
			let getCalled = false;

			mockFetch(async (url, opts) => {
				if (opts?.method === 'GET' && url.includes('/sandbox') && url.includes('sandbox-123')) {
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

				if (opts?.method === 'POST' && url.includes('/sandbox')) {
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

				if (opts?.method === 'POST' && url.includes('/sandbox')) {
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
				if (opts?.method === 'POST' && url.includes('/sandbox')) {
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
								exitCode: 0,
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
				if (opts?.method === 'POST' && url.includes('/sandbox')) {
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
				if (opts?.method === 'POST' && url.includes('/sandbox')) {
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

		test('should return captured stdout in result', async () => {
			const stdoutChunks = [
				new Uint8Array([72, 101, 108, 108, 111]), // "Hello"
				new Uint8Array([32, 87, 111, 114, 108, 100, 33, 10]), // " World!\n"
			];

			mockFetch(async (url, opts) => {
				if (opts?.method === 'POST' && url.includes('/sandbox')) {
					return new Response(
						JSON.stringify({
							success: true,
							data: {
								sandboxId: 'sandbox-stdout-capture',
								status: 'running',
								stdoutStreamUrl: 'https://stream.example.com/stdout/capture-test',
								stderrStreamUrl: 'https://stream.example.com/stderr/capture-test',
							},
						}),
						{ status: 200, headers: { 'content-type': 'application/json' } }
					);
				}

				if (url.includes('stream.example.com/stdout')) {
					let chunkIndex = 0;
					const stream = new ReadableStream({
						pull(controller) {
							if (chunkIndex < stdoutChunks.length) {
								controller.enqueue(stdoutChunks[chunkIndex++]);
							} else {
								controller.close();
							}
						},
					});
					return new Response(stream, { status: 200 });
				}

				if (url.includes('stream.example.com/stderr')) {
					// Empty stderr stream
					return new Response(
						new ReadableStream({
							start(c) {
								c.close();
							},
						}),
						{ status: 200 }
					);
				}

				if (opts?.method === 'GET' && url.includes('sandbox-stdout-capture')) {
					return new Response(
						JSON.stringify({
							success: true,
							data: {
								sandboxId: 'sandbox-stdout-capture',
								status: 'terminated',
								exitCode: 0,
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
			const result = await client.run({ command: { exec: ['echo', 'Hello World!'] } });

			expect(result.sandboxId).toBe('sandbox-stdout-capture');
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toBe('Hello World!\n');
			expect(result.stderr).toBe('');
		});

		test('should return captured stderr in result', async () => {
			const stderrChunks = [
				new Uint8Array([69, 114, 114, 111, 114, 58, 32]), // "Error: "
				new Uint8Array([102, 97, 105, 108, 101, 100, 10]), // "failed\n"
			];

			mockFetch(async (url, opts) => {
				if (opts?.method === 'POST' && url.includes('/sandbox')) {
					return new Response(
						JSON.stringify({
							success: true,
							data: {
								sandboxId: 'sandbox-stderr-capture',
								status: 'running',
								stdoutStreamUrl: 'https://stream.example.com/stdout/stderr-test',
								stderrStreamUrl: 'https://stream.example.com/stderr/stderr-test',
							},
						}),
						{ status: 200, headers: { 'content-type': 'application/json' } }
					);
				}

				if (url.includes('stream.example.com/stdout')) {
					// Empty stdout stream
					return new Response(
						new ReadableStream({
							start(c) {
								c.close();
							},
						}),
						{ status: 200 }
					);
				}

				if (url.includes('stream.example.com/stderr')) {
					let chunkIndex = 0;
					const stream = new ReadableStream({
						pull(controller) {
							if (chunkIndex < stderrChunks.length) {
								controller.enqueue(stderrChunks[chunkIndex++]);
							} else {
								controller.close();
							}
						},
					});
					return new Response(stream, { status: 200 });
				}

				if (opts?.method === 'GET' && url.includes('sandbox-stderr-capture')) {
					return new Response(
						JSON.stringify({
							success: true,
							data: {
								sandboxId: 'sandbox-stderr-capture',
								status: 'terminated',
								exitCode: 1,
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
			const result = await client.run({ command: { exec: ['some-failing-command'] } });

			expect(result.sandboxId).toBe('sandbox-stderr-capture');
			expect(result.exitCode).toBe(1);
			expect(result.stdout).toBe('');
			expect(result.stderr).toBe('Error: failed\n');
		});

		test('should capture output while also streaming to user-provided stdout', async () => {
			const stdoutChunks = [
				new Uint8Array([84, 101, 115, 116, 32]), // "Test "
				new Uint8Array([111, 117, 116, 112, 117, 116, 10]), // "output\n"
			];
			const receivedChunks: Buffer[] = [];

			const userWritable = new Writable({
				write(chunk, _encoding, callback) {
					receivedChunks.push(Buffer.from(chunk));
					callback();
				},
			});

			mockFetch(async (url, opts) => {
				if (opts?.method === 'POST' && url.includes('/sandbox')) {
					return new Response(
						JSON.stringify({
							success: true,
							data: {
								sandboxId: 'sandbox-tee-stdout',
								status: 'running',
								stdoutStreamUrl: 'https://stream.example.com/stdout/tee-test',
								stderrStreamUrl: 'https://stream.example.com/stderr/tee-test',
							},
						}),
						{ status: 200, headers: { 'content-type': 'application/json' } }
					);
				}

				if (url.includes('stream.example.com/stdout')) {
					let chunkIndex = 0;
					const stream = new ReadableStream({
						pull(controller) {
							if (chunkIndex < stdoutChunks.length) {
								controller.enqueue(stdoutChunks[chunkIndex++]);
							} else {
								controller.close();
							}
						},
					});
					return new Response(stream, { status: 200 });
				}

				if (url.includes('stream.example.com/stderr')) {
					return new Response(
						new ReadableStream({
							start(c) {
								c.close();
							},
						}),
						{ status: 200 }
					);
				}

				if (opts?.method === 'GET' && url.includes('sandbox-tee-stdout')) {
					return new Response(
						JSON.stringify({
							success: true,
							data: {
								sandboxId: 'sandbox-tee-stdout',
								status: 'terminated',
								exitCode: 0,
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
			const result = await client.run(
				{ command: { exec: ['echo', 'Test output'] } },
				{ stdout: userWritable }
			);

			// Verify captured output in result
			expect(result.stdout).toBe('Test output\n');

			// Verify user stream also received the output (tee behavior)
			const userOutput = Buffer.concat(receivedChunks).toString();
			expect(userOutput).toBe('Test output\n');
		});

		test('should capture output while also streaming to user-provided stderr', async () => {
			const stderrChunks = [
				new Uint8Array([87, 97, 114, 110, 105, 110, 103, 58, 32]), // "Warning: "
				new Uint8Array([116, 101, 115, 116, 10]), // "test\n"
			];
			const receivedChunks: Buffer[] = [];

			const userWritable = new Writable({
				write(chunk, _encoding, callback) {
					receivedChunks.push(Buffer.from(chunk));
					callback();
				},
			});

			mockFetch(async (url, opts) => {
				if (opts?.method === 'POST' && url.includes('/sandbox')) {
					return new Response(
						JSON.stringify({
							success: true,
							data: {
								sandboxId: 'sandbox-tee-stderr',
								status: 'running',
								stdoutStreamUrl: 'https://stream.example.com/stdout/tee-stderr-test',
								stderrStreamUrl: 'https://stream.example.com/stderr/tee-stderr-test',
							},
						}),
						{ status: 200, headers: { 'content-type': 'application/json' } }
					);
				}

				if (url.includes('stream.example.com/stdout')) {
					return new Response(
						new ReadableStream({
							start(c) {
								c.close();
							},
						}),
						{ status: 200 }
					);
				}

				if (url.includes('stream.example.com/stderr')) {
					let chunkIndex = 0;
					const stream = new ReadableStream({
						pull(controller) {
							if (chunkIndex < stderrChunks.length) {
								controller.enqueue(stderrChunks[chunkIndex++]);
							} else {
								controller.close();
							}
						},
					});
					return new Response(stream, { status: 200 });
				}

				if (opts?.method === 'GET' && url.includes('sandbox-tee-stderr')) {
					return new Response(
						JSON.stringify({
							success: true,
							data: {
								sandboxId: 'sandbox-tee-stderr',
								status: 'terminated',
								exitCode: 0,
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
			const result = await client.run(
				{ command: { exec: ['some-command'] } },
				{ stderr: userWritable }
			);

			// Verify captured output in result
			expect(result.stderr).toBe('Warning: test\n');

			// Verify user stream also received the output (tee behavior)
			const userOutput = Buffer.concat(receivedChunks).toString();
			expect(userOutput).toBe('Warning: test\n');
		});

		test('should handle combined output (stdout === stderr)', async () => {
			const combinedChunks = [
				new Uint8Array([79, 117, 116, 58, 32]), // "Out: "
				new Uint8Array([109, 105, 120, 101, 100, 10]), // "mixed\n"
			];

			// Use the same URL for both stdout and stderr to simulate combined output
			const combinedStreamUrl = 'https://stream.example.com/combined/test';

			mockFetch(async (url, opts) => {
				if (opts?.method === 'POST' && url.includes('/sandbox')) {
					return new Response(
						JSON.stringify({
							success: true,
							data: {
								sandboxId: 'sandbox-combined',
								status: 'running',
								stdoutStreamUrl: combinedStreamUrl,
								stderrStreamUrl: combinedStreamUrl, // Same URL = combined output
							},
						}),
						{ status: 200, headers: { 'content-type': 'application/json' } }
					);
				}

				if (url.includes('stream.example.com/combined')) {
					let chunkIndex = 0;
					const stream = new ReadableStream({
						pull(controller) {
							if (chunkIndex < combinedChunks.length) {
								controller.enqueue(combinedChunks[chunkIndex++]);
							} else {
								controller.close();
							}
						},
					});
					return new Response(stream, { status: 200 });
				}

				if (opts?.method === 'GET' && url.includes('sandbox-combined')) {
					return new Response(
						JSON.stringify({
							success: true,
							data: {
								sandboxId: 'sandbox-combined',
								status: 'terminated',
								exitCode: 0,
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
			const result = await client.run({ command: { exec: ['some-command'] } });

			expect(result.sandboxId).toBe('sandbox-combined');
			expect(result.exitCode).toBe(0);
			// When combined, both stdout and stderr should have the same content
			expect(result.stdout).toBe('Out: mixed\n');
			expect(result.stderr).toBe('Out: mixed\n');
		});

		test('should tee combined output to stdout user stream only to avoid duplication', async () => {
			const combinedChunks = [
				new Uint8Array([67, 111, 109, 98, 105, 110, 101, 100, 10]), // "Combined\n"
			];

			const stdoutReceivedChunks: Buffer[] = [];
			const stderrReceivedChunks: Buffer[] = [];

			const userStdout = new Writable({
				write(chunk, _encoding, callback) {
					stdoutReceivedChunks.push(Buffer.from(chunk));
					callback();
				},
			});

			const userStderr = new Writable({
				write(chunk, _encoding, callback) {
					stderrReceivedChunks.push(Buffer.from(chunk));
					callback();
				},
			});

			const combinedStreamUrl = 'https://stream.example.com/combined/both-streams';

			mockFetch(async (url, opts) => {
				if (opts?.method === 'POST' && url.includes('/sandbox')) {
					return new Response(
						JSON.stringify({
							success: true,
							data: {
								sandboxId: 'sandbox-combined-both',
								status: 'running',
								stdoutStreamUrl: combinedStreamUrl,
								stderrStreamUrl: combinedStreamUrl, // Same URL = combined output
							},
						}),
						{ status: 200, headers: { 'content-type': 'application/json' } }
					);
				}

				if (url.includes('stream.example.com/combined')) {
					let chunkIndex = 0;
					const stream = new ReadableStream({
						pull(controller) {
							if (chunkIndex < combinedChunks.length) {
								controller.enqueue(combinedChunks[chunkIndex++]);
							} else {
								controller.close();
							}
						},
					});
					return new Response(stream, { status: 200 });
				}

				if (opts?.method === 'GET' && url.includes('sandbox-combined-both')) {
					return new Response(
						JSON.stringify({
							success: true,
							data: {
								sandboxId: 'sandbox-combined-both',
								status: 'terminated',
								exitCode: 0,
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
			const result = await client.run(
				{ command: { exec: ['some-command'] } },
				{ stdout: userStdout, stderr: userStderr }
			);

			// Verify captured output in result
			expect(result.stdout).toBe('Combined\n');
			expect(result.stderr).toBe('Combined\n');

			// In combined mode, only stdout user stream receives the teed output
			// to avoid duplicate lines when both streams go to the same terminal
			const stdoutOutput = Buffer.concat(stdoutReceivedChunks).toString();
			const stderrOutput = Buffer.concat(stderrReceivedChunks).toString();
			expect(stdoutOutput).toBe('Combined\n');
			expect(stderrOutput).toBe('');
		});

		test('should return empty strings when no output', async () => {
			mockFetch(async (url, opts) => {
				if (opts?.method === 'POST' && url.includes('/sandbox')) {
					return new Response(
						JSON.stringify({
							success: true,
							data: {
								sandboxId: 'sandbox-empty-output',
								status: 'running',
								stdoutStreamUrl: 'https://stream.example.com/stdout/empty',
								stderrStreamUrl: 'https://stream.example.com/stderr/empty',
							},
						}),
						{ status: 200, headers: { 'content-type': 'application/json' } }
					);
				}

				if (
					url.includes('stream.example.com/stdout') ||
					url.includes('stream.example.com/stderr')
				) {
					// Empty streams - close immediately
					return new Response(
						new ReadableStream({
							start(c) {
								c.close();
							},
						}),
						{ status: 200 }
					);
				}

				if (opts?.method === 'GET' && url.includes('sandbox-empty-output')) {
					return new Response(
						JSON.stringify({
							success: true,
							data: {
								sandboxId: 'sandbox-empty-output',
								status: 'terminated',
								exitCode: 0,
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
			const result = await client.run({ command: { exec: ['true'] } });

			expect(result.sandboxId).toBe('sandbox-empty-output');
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toBe('');
			expect(result.stderr).toBe('');
		});

		test('should handle multi-chunk output', async () => {
			// Simulate large output split across many chunks
			const chunks: Uint8Array[] = [];
			for (let i = 0; i < 10; i++) {
				chunks.push(new Uint8Array(Buffer.from(`Line ${i}\n`)));
			}

			mockFetch(async (url, opts) => {
				if (opts?.method === 'POST' && url.includes('/sandbox')) {
					return new Response(
						JSON.stringify({
							success: true,
							data: {
								sandboxId: 'sandbox-multi-chunk',
								status: 'running',
								stdoutStreamUrl: 'https://stream.example.com/stdout/multi',
								stderrStreamUrl: 'https://stream.example.com/stderr/multi',
							},
						}),
						{ status: 200, headers: { 'content-type': 'application/json' } }
					);
				}

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

				if (url.includes('stream.example.com/stderr')) {
					return new Response(
						new ReadableStream({
							start(c) {
								c.close();
							},
						}),
						{ status: 200 }
					);
				}

				if (opts?.method === 'GET' && url.includes('sandbox-multi-chunk')) {
					return new Response(
						JSON.stringify({
							success: true,
							data: {
								sandboxId: 'sandbox-multi-chunk',
								status: 'terminated',
								exitCode: 0,
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
			const result = await client.run({ command: { exec: ['generate-output'] } });

			expect(result.sandboxId).toBe('sandbox-multi-chunk');
			expect(result.exitCode).toBe(0);

			// Verify all chunks were captured and concatenated
			const expectedOutput = Array.from({ length: 10 }, (_, i) => `Line ${i}`).join('\n') + '\n';
			expect(result.stdout).toBe(expectedOutput);
			expect(result.stderr).toBe('');
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

	describe('sandboxPause', () => {
		test('should pause a sandbox successfully', async () => {
			let pauseCalled = false;

			mockFetch(async (url, opts) => {
				if (opts?.method === 'POST' && url.includes('/pause')) {
					pauseCalled = true;
					return new Response(JSON.stringify({ success: true }), {
						status: 200,
						headers: { 'content-type': 'application/json' },
					});
				}
				return new Response(null, { status: 404 });
			});

			const client = new APIClient(
				'https://sandbox.example.com',
				createMockLogger(),
				'test-sdk-key'
			);

			await sandboxPause(client, { sandboxId: 'sandbox-123' });
			expect(pauseCalled).toBe(true);
		});

		test('should throw SandboxNotFoundError when sandbox not found', async () => {
			mockFetch(async (url, opts) => {
				if (opts?.method === 'POST' && url.includes('/pause')) {
					return new Response(
						JSON.stringify({
							success: false,
							message: 'Sandbox not found',
							code: 'SANDBOX_NOT_FOUND',
						}),
						{ status: 200, headers: { 'content-type': 'application/json' } }
					);
				}
				return new Response(null, { status: 404 });
			});

			const client = new APIClient(
				'https://sandbox.example.com',
				createMockLogger(),
				'test-sdk-key'
			);

			try {
				await sandboxPause(client, { sandboxId: 'nonexistent' });
				expect(true).toBe(false); // should not reach here
			} catch (error) {
				expect((error as { _tag: string })._tag).toBe('SandboxNotFoundError');
				expect((error as { sandboxId: string }).sandboxId).toBe('nonexistent');
			}
		});
	});

	describe('sandboxResume', () => {
		test('should resume a sandbox successfully', async () => {
			let resumeCalled = false;

			mockFetch(async (url, opts) => {
				if (opts?.method === 'POST' && url.includes('/resume')) {
					resumeCalled = true;
					return new Response(JSON.stringify({ success: true }), {
						status: 200,
						headers: { 'content-type': 'application/json' },
					});
				}
				return new Response(null, { status: 404 });
			});

			const client = new APIClient(
				'https://sandbox.example.com',
				createMockLogger(),
				'test-sdk-key'
			);

			await sandboxResume(client, { sandboxId: 'sandbox-123' });
			expect(resumeCalled).toBe(true);
		});

		test('should throw SandboxNotFoundError when sandbox not found', async () => {
			mockFetch(async (url, opts) => {
				if (opts?.method === 'POST' && url.includes('/resume')) {
					return new Response(
						JSON.stringify({
							success: false,
							message: 'Sandbox not found',
							code: 'SANDBOX_NOT_FOUND',
						}),
						{ status: 200, headers: { 'content-type': 'application/json' } }
					);
				}
				return new Response(null, { status: 404 });
			});

			const client = new APIClient(
				'https://sandbox.example.com',
				createMockLogger(),
				'test-sdk-key'
			);

			try {
				await sandboxResume(client, { sandboxId: 'nonexistent' });
				expect(true).toBe(false); // should not reach here
			} catch (error) {
				expect((error as { _tag: string })._tag).toBe('SandboxNotFoundError');
				expect((error as { sandboxId: string }).sandboxId).toBe('nonexistent');
			}
		});
	});
});
