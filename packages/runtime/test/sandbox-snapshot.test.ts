import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { HTTPSandboxService } from '../src/services/sandbox/http';
import { APIClient } from '@agentuity/server';
import { mockFetch, createMockLogger } from '@agentuity/test-utils';

describe('HTTPSandboxService.snapshot', () => {
	const originalEnv = { ...process.env };

	beforeEach(() => {
		process.env.AGENTUITY_SDK_KEY = 'test-sdk-key';
		process.env.AGENTUITY_STREAM_URL = 'https://sandbox.example.com';
	});

	afterEach(() => {
		process.env = { ...originalEnv };
	});

	function createService(orgId?: string): HTTPSandboxService {
		const client = new APIClient('https://api.example.com', createMockLogger(), 'test-api-key');
		return new HTTPSandboxService(client, 'https://stream.example.com', orgId);
	}

	describe('snapshot.create', () => {
		test('should create a snapshot from a sandbox', async () => {
			mockFetch(async (url, opts) => {
				if (opts?.method === 'POST' && url.includes('/snapshot')) {
					return new Response(
						JSON.stringify({
							success: true,
							data: {
								snapshotId: 'snp_123',
								name: 'test-snapshot',
								tag: 'latest',
								sizeBytes: 1024,
								fileCount: 10,
								createdAt: '2025-01-26T12:00:00Z',
							},
						}),
						{ status: 200, headers: { 'content-type': 'application/json' } }
					);
				}
				return new Response(null, { status: 404 });
			});

			const service = createService();
			const snapshot = await service.snapshot.create('sbx_abc123');

			expect(snapshot.snapshotId).toBe('snp_123');
			expect(snapshot.name).toBe('test-snapshot');
			expect(snapshot.tag).toBe('latest');
			expect(snapshot.sizeBytes).toBe(1024);
			expect(snapshot.fileCount).toBe(10);
		});

		test('should create a snapshot with options', async () => {
			mockFetch(async (url, opts) => {
				if (opts?.method === 'POST' && url.includes('/snapshot')) {
					const body = JSON.parse(opts.body as string);
					expect(body.name).toBe('my-snapshot');
					expect(body.description).toBe('Test description');
					expect(body.tag).toBe('v1.0');
					expect(body.public).toBe(true);

					return new Response(
						JSON.stringify({
							success: true,
							data: {
								snapshotId: 'snp_456',
								name: 'my-snapshot',
								description: 'Test description',
								tag: 'v1.0',
								public: true,
								sizeBytes: 2048,
								fileCount: 20,
								createdAt: '2025-01-26T12:00:00Z',
							},
						}),
						{ status: 200, headers: { 'content-type': 'application/json' } }
					);
				}
				return new Response(null, { status: 404 });
			});

			const service = createService();
			const snapshot = await service.snapshot.create('sbx_abc123', {
				name: 'my-snapshot',
				description: 'Test description',
				tag: 'v1.0',
				public: true,
			});

			expect(snapshot.snapshotId).toBe('snp_456');
			expect(snapshot.name).toBe('my-snapshot');
			expect(snapshot.description).toBe('Test description');
			expect(snapshot.tag).toBe('v1.0');
			expect(snapshot.public).toBe(true);
		});

		test('should forward orgId when creating a snapshot', async () => {
			mockFetch(async (url, opts) => {
				if (opts?.method === 'POST' && url.includes('/snapshot')) {
					expect(url).toContain('/sandbox/sbx_abc123/snapshot?orgId=org_123');

					return new Response(
						JSON.stringify({
							success: true,
							data: {
								snapshotId: 'snp_789',
								name: 'org-snapshot',
								tag: 'latest',
								sizeBytes: 4096,
								fileCount: 30,
								createdAt: '2025-01-26T12:00:00Z',
							},
						}),
						{ status: 200, headers: { 'content-type': 'application/json' } }
					);
				}
				return new Response(null, { status: 404 });
			});

			const service = createService();
			const snapshot = await service.snapshot.create('sbx_abc123', {
				orgId: 'org_123',
			});

			expect(snapshot.snapshotId).toBe('snp_789');
		});

		test('should forward service orgId when creating a snapshot', async () => {
			mockFetch(async (url, opts) => {
				if (opts?.method === 'POST' && url.includes('/snapshot')) {
					expect(url).toContain('/sandbox/sbx_abc123/snapshot?orgId=org_service');

					return new Response(
						JSON.stringify({
							success: true,
							data: {
								snapshotId: 'snp_890',
								name: 'service-org-snapshot',
								tag: 'latest',
								sizeBytes: 4096,
								fileCount: 30,
								createdAt: '2025-01-26T12:00:00Z',
							},
						}),
						{ status: 200, headers: { 'content-type': 'application/json' } }
					);
				}
				return new Response(null, { status: 404 });
			});

			const service = createService('org_service');
			const snapshot = await service.snapshot.create('sbx_abc123');

			expect(snapshot.snapshotId).toBe('snp_890');
		});
	});

	describe('snapshot.get', () => {
		test('should get snapshot details', async () => {
			mockFetch(async (url, opts) => {
				if (opts?.method === 'GET' && url.includes('/snapshots/snp_123')) {
					return new Response(
						JSON.stringify({
							success: true,
							data: {
								snapshotId: 'snp_123',
								name: 'test-snapshot',
								tag: 'latest',
								sizeBytes: 1024,
								fileCount: 10,
								createdAt: '2025-01-26T12:00:00Z',
								files: [
									{
										path: 'index.ts',
										size: 256,
										sha256: 'abc123',
										contentType: 'text/typescript',
										mode: 420,
									},
								],
							},
						}),
						{ status: 200, headers: { 'content-type': 'application/json' } }
					);
				}
				return new Response(null, { status: 404 });
			});

			const service = createService();
			const snapshot = await service.snapshot.get('snp_123');

			expect(snapshot.snapshotId).toBe('snp_123');
			expect(snapshot.name).toBe('test-snapshot');
			expect(snapshot.files).toHaveLength(1);
			expect(snapshot.files?.[0].path).toBe('index.ts');
		});

		test('should forward service orgId when getting snapshot details', async () => {
			mockFetch(async (url, opts) => {
				if (opts?.method === 'GET' && url.includes('/snapshots/snp_123')) {
					expect(url).toContain('/sandbox/snapshots/snp_123?orgId=org_service');

					return new Response(
						JSON.stringify({
							success: true,
							data: {
								snapshotId: 'snp_123',
								name: 'test-snapshot',
								tag: 'latest',
								sizeBytes: 1024,
								fileCount: 10,
								createdAt: '2025-01-26T12:00:00Z',
							},
						}),
						{ status: 200, headers: { 'content-type': 'application/json' } }
					);
				}
				return new Response(null, { status: 404 });
			});

			const service = createService('org_service');
			const snapshot = await service.snapshot.get('snp_123');

			expect(snapshot.snapshotId).toBe('snp_123');
		});
	});

	describe('snapshot.list', () => {
		test('should list snapshots', async () => {
			mockFetch(async (url, opts) => {
				if (opts?.method === 'GET' && url.includes('/snapshots')) {
					return new Response(
						JSON.stringify({
							success: true,
							data: {
								snapshots: [
									{
										snapshotId: 'snp_123',
										name: 'snapshot-1',
										tag: 'latest',
										sizeBytes: 1024,
										fileCount: 10,
										createdAt: '2025-01-26T12:00:00Z',
									},
									{
										snapshotId: 'snp_456',
										name: 'snapshot-2',
										tag: 'v1.0',
										sizeBytes: 2048,
										fileCount: 20,
										createdAt: '2025-01-25T12:00:00Z',
									},
								],
								total: 2,
							},
						}),
						{ status: 200, headers: { 'content-type': 'application/json' } }
					);
				}
				return new Response(null, { status: 404 });
			});

			const service = createService();
			const result = await service.snapshot.list();

			expect(result.snapshots).toHaveLength(2);
			expect(result.total).toBe(2);
			expect(result.snapshots[0].snapshotId).toBe('snp_123');
			expect(result.snapshots[1].snapshotId).toBe('snp_456');
		});

		test('should list snapshots with filters', async () => {
			mockFetch(async (url, opts) => {
				if (opts?.method === 'GET' && url.includes('/snapshots')) {
					const urlObj = new URL(url);
					expect(urlObj.searchParams.get('sandboxId')).toBe('sbx_abc123');
					expect(urlObj.searchParams.get('limit')).toBe('10');
					expect(urlObj.searchParams.get('offset')).toBe('5');

					return new Response(
						JSON.stringify({
							success: true,
							data: {
								snapshots: [
									{
										snapshotId: 'snp_789',
										name: 'filtered-snapshot',
										sizeBytes: 512,
										fileCount: 5,
										createdAt: '2025-01-26T12:00:00Z',
									},
								],
								total: 1,
							},
						}),
						{ status: 200, headers: { 'content-type': 'application/json' } }
					);
				}
				return new Response(null, { status: 404 });
			});

			const service = createService();
			const result = await service.snapshot.list({
				sandboxId: 'sbx_abc123',
				limit: 10,
				offset: 5,
			});

			expect(result.snapshots).toHaveLength(1);
			expect(result.snapshots[0].snapshotId).toBe('snp_789');
		});

		test('should handle empty snapshot list', async () => {
			mockFetch(async (url, opts) => {
				if (opts?.method === 'GET' && url.includes('/snapshots')) {
					return new Response(
						JSON.stringify({
							success: true,
							data: {
								snapshots: [],
								total: 0,
							},
						}),
						{ status: 200, headers: { 'content-type': 'application/json' } }
					);
				}
				return new Response(null, { status: 404 });
			});

			const service = createService();
			const result = await service.snapshot.list();

			expect(result.snapshots).toHaveLength(0);
			expect(result.total).toBe(0);
		});
	});

	describe('snapshot.delete', () => {
		test('should delete a snapshot', async () => {
			let deleteWasCalled = false;

			mockFetch(async (url, opts) => {
				if (opts?.method === 'DELETE' && url.includes('/snapshots/snp_123')) {
					deleteWasCalled = true;
					return new Response(
						JSON.stringify({
							success: true,
						}),
						{ status: 200, headers: { 'content-type': 'application/json' } }
					);
				}
				return new Response(null, { status: 404 });
			});

			const service = createService();
			await service.snapshot.delete('snp_123');

			expect(deleteWasCalled).toBe(true);
		});
	});

	describe('snapshot.tag', () => {
		test('should add a tag to a snapshot', async () => {
			mockFetch(async (url, opts) => {
				if (opts?.method === 'PATCH' && url.includes('/snapshots/snp_123')) {
					const body = JSON.parse(opts.body as string);
					expect(body.tag).toBe('production');

					return new Response(
						JSON.stringify({
							success: true,
							data: {
								snapshotId: 'snp_123',
								name: 'test-snapshot',
								tag: 'production',
								sizeBytes: 1024,
								fileCount: 10,
								createdAt: '2025-01-26T12:00:00Z',
							},
						}),
						{ status: 200, headers: { 'content-type': 'application/json' } }
					);
				}
				return new Response(null, { status: 404 });
			});

			const service = createService();
			const snapshot = await service.snapshot.tag('snp_123', 'production');

			expect(snapshot.snapshotId).toBe('snp_123');
			expect(snapshot.tag).toBe('production');
		});

		test('should remove a tag from a snapshot', async () => {
			mockFetch(async (url, opts) => {
				if (opts?.method === 'PATCH' && url.includes('/snapshots/snp_123')) {
					const body = JSON.parse(opts.body as string);
					expect(body.tag).toBeNull();

					return new Response(
						JSON.stringify({
							success: true,
							data: {
								snapshotId: 'snp_123',
								name: 'test-snapshot',
								tag: null,
								sizeBytes: 1024,
								fileCount: 10,
								createdAt: '2025-01-26T12:00:00Z',
							},
						}),
						{ status: 200, headers: { 'content-type': 'application/json' } }
					);
				}
				return new Response(null, { status: 404 });
			});

			const service = createService();
			const snapshot = await service.snapshot.tag('snp_123', null);

			expect(snapshot.snapshotId).toBe('snp_123');
			expect(snapshot.tag).toBeNull();
		});
	});

	describe('snapshot property', () => {
		test('should expose snapshot service on HTTPSandboxService', () => {
			const service = createService();

			expect(service.snapshot).toBeDefined();
			expect(typeof service.snapshot.create).toBe('function');
			expect(typeof service.snapshot.get).toBe('function');
			expect(typeof service.snapshot.list).toBe('function');
			expect(typeof service.snapshot.delete).toBe('function');
			expect(typeof service.snapshot.tag).toBe('function');
		});
	});

	describe('sandbox orgId forwarding', () => {
		test('should forward service orgId when getting a sandbox', async () => {
			mockFetch(async (url, opts) => {
				if (opts?.method === 'GET' && url.includes('/sandbox/sbx_abc123')) {
					expect(url).toContain('/sandbox/sbx_abc123?orgId=org_service');

					return new Response(
						JSON.stringify({
							success: true,
							data: {
								sandboxId: 'sbx_abc123',
								status: 'idle',
								createdAt: '2025-01-26T12:00:00Z',
								executions: 0,
								org: { id: 'org_service', name: 'Test Org' },
							},
						}),
						{ status: 200, headers: { 'content-type': 'application/json' } }
					);
				}
				return new Response(null, { status: 404 });
			});

			const service = createService('org_service');
			const sandbox = await service.get('sbx_abc123');

			expect(sandbox.sandboxId).toBe('sbx_abc123');
		});

		test('should forward service orgId from created sandbox instance methods', async () => {
			mockFetch(async (url, opts) => {
				if (opts?.method === 'POST' && url.includes('/sandbox')) {
					expect(url).toContain('/sandbox?orgId=org_service');

					return new Response(
						JSON.stringify({
							success: true,
							data: {
								sandboxId: 'sbx_abc123',
								status: 'idle',
							},
						}),
						{ status: 200, headers: { 'content-type': 'application/json' } }
					);
				}

				if (opts?.method === 'POST' && url.includes('/fs/sbx_abc123')) {
					expect(url).toContain('/fs/sbx_abc123?orgId=org_service');

					return new Response(
						JSON.stringify({
							success: true,
							data: { filesWritten: 1 },
						}),
						{ status: 200, headers: { 'content-type': 'application/json' } }
					);
				}

				return new Response(null, { status: 404 });
			});

			const service = createService('org_service');
			const sandbox = await service.create();
			await sandbox.writeFiles([{ path: 'index.ts', content: Buffer.from('console.log(1);') }]);

			expect(sandbox.id).toBe('sbx_abc123');
		});
	});
});
