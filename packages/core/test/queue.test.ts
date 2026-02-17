import { describe, test, expect } from 'bun:test';
import {
	QueueStorageService,
	QueueValidationError,
	QueueNotFoundError,
} from '../src/services/queue';
import { createMockAdapter } from './mock-adapter';
import { ServiceException } from '../src/services/exception';

describe('QueueStorageService', () => {
	const baseUrl = 'https://api.example.com';

	describe('publish', () => {
		test('should publish message and return result from top-level response fields', async () => {
			const mockData = {
				id: 'qmsg_abc123',
				offset: 42,
				published_at: '2026-02-13T14:32:37.283Z',
			};
			const { adapter, calls } = createMockAdapter([{ ok: true, data: mockData }]);

			const service = new QueueStorageService(baseUrl, adapter);
			const result = await service.publish('my_queue', { hello: 'world' });

			expect(result.id).toBe('qmsg_abc123');
			expect(result.offset).toBe(42);
			expect(result.publishedAt).toBe('2026-02-13T14:32:37.283Z');
			expect(calls).toHaveLength(1);
			expect(calls[0].url).toContain('/queue/messages/publish/2026-01-15/my_queue');
			expect(calls[0].options.method).toBe('POST');
		});

		test('should handle response with additional fields (like real API)', async () => {
			// Simulate the actual API response which includes extra fields
			const mockData = {
				id: 'qmsg_5k9lwhcsbk83nhwuhnbpdxnh',
				queue_id: 'queue_v0g3a41tl9ngvk36t3nrjp',
				offset: -1,
				payload: { test: true },
				size: 13,
				state: 'pending',
				delivery_attempts: 0,
				published_at: '2026-02-13T14:32:37.283892318Z',
				created_at: '2026-02-13T14:32:37.283892318Z',
			};
			const { adapter } = createMockAdapter([{ ok: true, data: mockData }]);

			const service = new QueueStorageService(baseUrl, adapter);
			const result = await service.publish('test_queue', { test: true });

			expect(result.id).toBe('qmsg_5k9lwhcsbk83nhwuhnbpdxnh');
			expect(result.offset).toBe(-1);
			expect(result.publishedAt).toBe('2026-02-13T14:32:37.283892318Z');
		});

		test('should publish string payload', async () => {
			const mockData = {
				id: 'qmsg_str1',
				offset: 0,
				published_at: '2026-02-13T00:00:00Z',
			};
			const { adapter, calls } = createMockAdapter([{ ok: true, data: mockData }]);

			const service = new QueueStorageService(baseUrl, adapter);
			await service.publish('my_queue', 'hello world');

			expect(calls).toHaveLength(1);
			const body = JSON.parse(calls[0].options.body as string);
			expect(body.payload).toBe('hello world');
		});

		test('should publish object payload', async () => {
			const mockData = {
				id: 'qmsg_obj1',
				offset: 0,
				published_at: '2026-02-13T00:00:00Z',
			};
			const { adapter, calls } = createMockAdapter([{ ok: true, data: mockData }]);

			const service = new QueueStorageService(baseUrl, adapter);
			await service.publish('my_queue', { key: 'value' });

			expect(calls).toHaveLength(1);
			const body = JSON.parse(calls[0].options.body as string);
			expect(body.payload).toBe('{"key":"value"}');
		});

		test('should include metadata when provided', async () => {
			const mockData = {
				id: 'qmsg_meta1',
				offset: 0,
				published_at: '2026-02-13T00:00:00Z',
			};
			const { adapter, calls } = createMockAdapter([{ ok: true, data: mockData }]);

			const service = new QueueStorageService(baseUrl, adapter);
			await service.publish('my_queue', 'payload', {
				metadata: { priority: 'high' },
			});

			const body = JSON.parse(calls[0].options.body as string);
			expect(body.metadata).toEqual({ priority: 'high' });
		});

		test('should include partition_key when provided', async () => {
			const mockData = {
				id: 'qmsg_pk1',
				offset: 0,
				published_at: '2026-02-13T00:00:00Z',
			};
			const { adapter, calls } = createMockAdapter([{ ok: true, data: mockData }]);

			const service = new QueueStorageService(baseUrl, adapter);
			await service.publish('my_queue', 'payload', {
				partitionKey: 'customer-123',
			});

			const body = JSON.parse(calls[0].options.body as string);
			expect(body.partition_key).toBe('customer-123');
		});

		test('should include idempotency_key when provided', async () => {
			const mockData = {
				id: 'qmsg_ik1',
				offset: 0,
				published_at: '2026-02-13T00:00:00Z',
			};
			const { adapter, calls } = createMockAdapter([{ ok: true, data: mockData }]);

			const service = new QueueStorageService(baseUrl, adapter);
			await service.publish('my_queue', 'payload', {
				idempotencyKey: 'order-456-v1',
			});

			const body = JSON.parse(calls[0].options.body as string);
			expect(body.idempotency_key).toBe('order-456-v1');
		});

		test('should include ttl_seconds when provided', async () => {
			const mockData = {
				id: 'qmsg_ttl1',
				offset: 0,
				published_at: '2026-02-13T00:00:00Z',
			};
			const { adapter, calls } = createMockAdapter([{ ok: true, data: mockData }]);

			const service = new QueueStorageService(baseUrl, adapter);
			await service.publish('my_queue', 'payload', { ttl: 3600 });

			const body = JSON.parse(calls[0].options.body as string);
			expect(body.ttl_seconds).toBe(3600);
		});

		test('should include project_id when provided', async () => {
			const mockData = {
				id: 'qmsg_proj1',
				offset: 0,
				published_at: '2026-02-13T00:00:00Z',
			};
			const { adapter, calls } = createMockAdapter([{ ok: true, data: mockData }]);

			const service = new QueueStorageService(baseUrl, adapter);
			await service.publish('my_queue', 'payload', {
				projectId: 'proj_abc',
			});

			const body = JSON.parse(calls[0].options.body as string);
			expect(body.project_id).toBe('proj_abc');
		});

		test('should include agent_id when provided', async () => {
			const mockData = {
				id: 'qmsg_agent1',
				offset: 0,
				published_at: '2026-02-13T00:00:00Z',
			};
			const { adapter, calls } = createMockAdapter([{ ok: true, data: mockData }]);

			const service = new QueueStorageService(baseUrl, adapter);
			await service.publish('my_queue', 'payload', {
				agentId: 'agent_xyz',
			});

			const body = JSON.parse(calls[0].options.body as string);
			expect(body.agent_id).toBe('agent_xyz');
		});

		test('should append sync=true query param when sync is true', async () => {
			const mockData = {
				id: 'qmsg_sync1',
				offset: 0,
				published_at: '2026-02-13T00:00:00Z',
			};
			const { adapter, calls } = createMockAdapter([{ ok: true, data: mockData }]);

			const service = new QueueStorageService(baseUrl, adapter);
			await service.publish('my_queue', 'payload', { sync: true });

			expect(calls[0].url).toContain('?sync=true');
		});

		test('should not append sync query param when sync is not set', async () => {
			const mockData = {
				id: 'qmsg_nosync1',
				offset: 0,
				published_at: '2026-02-13T00:00:00Z',
			};
			const { adapter, calls } = createMockAdapter([{ ok: true, data: mockData }]);

			const service = new QueueStorageService(baseUrl, adapter);
			await service.publish('my_queue', 'payload');

			expect(calls[0].url).not.toContain('sync');
		});

		test('should URL-encode queue name', async () => {
			const mockData = {
				id: 'qmsg_enc1',
				offset: 0,
				published_at: '2026-02-13T00:00:00Z',
			};
			const { adapter, calls } = createMockAdapter([{ ok: true, data: mockData }]);

			const service = new QueueStorageService(baseUrl, adapter);
			await service.publish('my_queue', 'payload');

			expect(calls[0].url).toContain('/queue/messages/publish/2026-01-15/my_queue');
		});

		test('should set content type to application/json', async () => {
			const mockData = {
				id: 'qmsg_ct1',
				offset: 0,
				published_at: '2026-02-13T00:00:00Z',
			};
			const { adapter, calls } = createMockAdapter([{ ok: true, data: mockData }]);

			const service = new QueueStorageService(baseUrl, adapter);
			await service.publish('my_queue', 'payload');

			expect(calls[0].options.contentType).toBe('application/json');
		});

		test('should set timeout signal', async () => {
			const mockData = {
				id: 'qmsg_sig1',
				offset: 0,
				published_at: '2026-02-13T00:00:00Z',
			};
			const { adapter, calls } = createMockAdapter([{ ok: true, data: mockData }]);

			const service = new QueueStorageService(baseUrl, adapter);
			await service.publish('my_queue', 'payload');

			expect(calls[0].options.signal).toBeDefined();
		});

		test('should set telemetry attributes', async () => {
			const mockData = {
				id: 'qmsg_tel1',
				offset: 0,
				published_at: '2026-02-13T00:00:00Z',
			};
			const { adapter, calls } = createMockAdapter([{ ok: true, data: mockData }]);

			const service = new QueueStorageService(baseUrl, adapter);
			await service.publish('my_queue', 'payload');

			expect(calls[0].options.telemetry).toBeDefined();
			expect(calls[0].options.telemetry?.name).toBe('agentuity.queue.publish');
			expect(calls[0].options.telemetry?.attributes?.queueName).toBe('my_queue');
		});
	});

	describe('publish - error handling', () => {
		test('should throw QueueNotFoundError on 404', async () => {
			const { adapter } = createMockAdapter([{ ok: false, status: 404 }]);

			const service = new QueueStorageService(baseUrl, adapter);

			await expect(service.publish('nonexistent_queue', 'payload')).rejects.toThrow(
				QueueNotFoundError
			);
		});

		test('should throw ServiceException on server error', async () => {
			const { adapter } = createMockAdapter([
				{ ok: false, status: 500, body: { error: 'Internal Server Error' } },
			]);

			const service = new QueueStorageService(baseUrl, adapter);

			await expect(service.publish('my_queue', 'payload')).rejects.toThrow(ServiceException);
		});
	});

	describe('publish - validation', () => {
		test('should throw QueueValidationError for empty queue name', async () => {
			const { adapter } = createMockAdapter([]);

			const service = new QueueStorageService(baseUrl, adapter);

			await expect(service.publish('', 'payload')).rejects.toThrow(QueueValidationError);
		});

		test('should throw QueueValidationError for queue name exceeding max length', async () => {
			const { adapter } = createMockAdapter([]);

			const service = new QueueStorageService(baseUrl, adapter);
			const longName = 'a'.repeat(257);

			await expect(service.publish(longName, 'payload')).rejects.toThrow(QueueValidationError);
		});

		test('should throw QueueValidationError for invalid queue name characters', async () => {
			const { adapter } = createMockAdapter([]);

			const service = new QueueStorageService(baseUrl, adapter);

			await expect(service.publish('Invalid-Queue!', 'payload')).rejects.toThrow(
				QueueValidationError
			);
		});

		test('should throw QueueValidationError for queue name starting with digit', async () => {
			const { adapter } = createMockAdapter([]);

			const service = new QueueStorageService(baseUrl, adapter);

			await expect(service.publish('1queue', 'payload')).rejects.toThrow(QueueValidationError);
		});

		test('should accept valid queue names', async () => {
			const mockData = {
				id: 'qmsg_valid1',
				offset: 0,
				published_at: '2026-02-13T00:00:00Z',
			};
			const { adapter } = createMockAdapter([
				{ ok: true, data: mockData },
				{ ok: true, data: mockData },
				{ ok: true, data: mockData },
			]);

			const service = new QueueStorageService(baseUrl, adapter);

			// Should not throw
			await service.publish('my_queue', 'payload');
			await service.publish('_private_queue', 'payload');
			await service.publish('queue-with-dashes', 'payload');
		});

		test('should throw QueueValidationError for empty payload', async () => {
			const { adapter } = createMockAdapter([]);

			const service = new QueueStorageService(baseUrl, adapter);

			await expect(service.publish('my_queue', '')).rejects.toThrow(QueueValidationError);
		});

		test('should throw QueueValidationError for partition key exceeding max length', async () => {
			const { adapter } = createMockAdapter([]);

			const service = new QueueStorageService(baseUrl, adapter);
			const longKey = 'k'.repeat(257);

			await expect(
				service.publish('my_queue', 'payload', { partitionKey: longKey })
			).rejects.toThrow(QueueValidationError);
		});

		test('should throw QueueValidationError for idempotency key exceeding max length', async () => {
			const { adapter } = createMockAdapter([]);

			const service = new QueueStorageService(baseUrl, adapter);
			const longKey = 'k'.repeat(257);

			await expect(
				service.publish('my_queue', 'payload', { idempotencyKey: longKey })
			).rejects.toThrow(QueueValidationError);
		});

		test('should throw QueueValidationError for negative TTL', async () => {
			const { adapter } = createMockAdapter([]);

			const service = new QueueStorageService(baseUrl, adapter);

			await expect(service.publish('my_queue', 'payload', { ttl: -1 })).rejects.toThrow(
				QueueValidationError
			);
		});

		test('should allow zero TTL', async () => {
			const mockData = {
				id: 'qmsg_ttl0',
				offset: 0,
				published_at: '2026-02-13T00:00:00Z',
			};
			const { adapter, calls } = createMockAdapter([{ ok: true, data: mockData }]);

			const service = new QueueStorageService(baseUrl, adapter);
			await service.publish('my_queue', 'payload', { ttl: 0 });

			const body = JSON.parse(calls[0].options.body as string);
			expect(body.ttl_seconds).toBe(0);
		});
	});

	describe('onBefore hook', () => {
		test('should call onBefore for publish operation', async () => {
			const onBeforeCalls: { url: string; method: string }[] = [];
			const mockData = {
				id: 'qmsg_hook1',
				offset: 0,
				published_at: '2026-02-13T00:00:00Z',
			};
			const { adapter, beforeCalls } = createMockAdapter([{ ok: true, data: mockData }], {
				onBefore: async (url, options, invoke) => {
					onBeforeCalls.push({ url, method: options.method });
					await invoke();
				},
			});

			const service = new QueueStorageService(baseUrl, adapter);
			await service.publish('my_queue', 'payload');

			expect(beforeCalls).toHaveLength(1);
			expect(onBeforeCalls).toHaveLength(1);
			expect(onBeforeCalls[0].method).toBe('POST');
			expect(onBeforeCalls[0].url).toContain('/queue/messages/publish/2026-01-15/my_queue');
		});
	});

	describe('onAfter hook', () => {
		test('should call onAfter on successful publish', async () => {
			const afterCalls: { status: number; hasError: boolean }[] = [];
			const mockData = {
				id: 'qmsg_after1',
				offset: 0,
				published_at: '2026-02-13T00:00:00Z',
			};
			const { adapter } = createMockAdapter([{ ok: true, data: mockData }], {
				onAfter: async (response, error) => {
					afterCalls.push({ status: response.status, hasError: !!error });
				},
			});

			const service = new QueueStorageService(baseUrl, adapter);
			await service.publish('my_queue', 'payload');

			expect(afterCalls).toHaveLength(1);
			expect(afterCalls[0].status).toBe(200);
			expect(afterCalls[0].hasError).toBe(false);
		});

		test('should call onAfter on error response', async () => {
			const afterCalls: { status: number; hasError: boolean }[] = [];
			const { adapter } = createMockAdapter([{ ok: false, status: 500 }], {
				onAfter: async (response, error) => {
					afterCalls.push({ status: response.status, hasError: !!error });
				},
			});

			const service = new QueueStorageService(baseUrl, adapter);
			await service.publish('my_queue', 'payload').catch(() => {});

			expect(afterCalls).toHaveLength(1);
			expect(afterCalls[0].status).toBe(500);
			expect(afterCalls[0].hasError).toBe(true);
		});
	});
});
