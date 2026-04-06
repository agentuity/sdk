import { describe, test, expect } from 'bun:test';
import {
	QueueStorageService,
	QueueValidationError,
	QueueNotFoundError,
	QueuePublishResultSchema,
} from '../src/services/queue/service.ts';
import { createMockAdapter } from '@agentuity/test-utils';
import { ServiceException } from '../src/services/exception.ts';

describe('QueueStorageService', () => {
	const baseUrl = 'https://api.example.com';

	describe('publish', () => {
		test('should publish message and return result from API envelope', async () => {
			const mockData = {
				success: true,
				data: {
					message: {
						id: 'qmsg_abc123',
						offset: 42,
						published_at: '2026-02-13T14:32:37.283Z',
					},
				},
			};
			const { adapter, calls } = createMockAdapter([{ ok: true, data: mockData }]);

			const service = new QueueStorageService(baseUrl, adapter);
			const result = await service.publish('my_queue', { hello: 'world' });

			expect(result.id).toBe('qmsg_abc123');
			expect(result.offset).toBe(42);
			expect(result.publishedAt).toBe('2026-02-13T14:32:37.283Z');
			expect(calls).toHaveLength(1);
			expect(calls[0].url).toContain('/queue/messages/publish/my_queue');
			expect(calls[0].options.method).toBe('POST');
		});

		test('should handle response with additional fields (like real API)', async () => {
			const mockData = {
				success: true,
				data: {
					message: {
						id: 'qmsg_5k9lwhcsbk83nhwuhnbpdxnh',
						queue_id: 'queue_v0g3a41tl9ngvk36t3nrjp',
						offset: -1,
						payload: { test: true },
						size: 13,
						state: 'pending',
						delivery_attempts: 0,
						published_at: '2026-02-13T14:32:37.283892318Z',
						created_at: '2026-02-13T14:32:37.283892318Z',
					},
				},
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
				success: true,
				data: {
					message: {
						id: 'qmsg_str1',
						offset: 0,
						published_at: '2026-02-13T00:00:00Z',
					},
				},
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
				success: true,
				data: {
					message: {
						id: 'qmsg_obj1',
						offset: 0,
						published_at: '2026-02-13T00:00:00Z',
					},
				},
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
				success: true,
				data: {
					message: {
						id: 'qmsg_meta1',
						offset: 0,
						published_at: '2026-02-13T00:00:00Z',
					},
				},
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
				success: true,
				data: {
					message: {
						id: 'qmsg_pk1',
						offset: 0,
						published_at: '2026-02-13T00:00:00Z',
					},
				},
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
				success: true,
				data: {
					message: {
						id: 'qmsg_ik1',
						offset: 0,
						published_at: '2026-02-13T00:00:00Z',
					},
				},
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
				success: true,
				data: {
					message: {
						id: 'qmsg_ttl1',
						offset: 0,
						published_at: '2026-02-13T00:00:00Z',
					},
				},
			};
			const { adapter, calls } = createMockAdapter([{ ok: true, data: mockData }]);

			const service = new QueueStorageService(baseUrl, adapter);
			await service.publish('my_queue', 'payload', { ttl: 3600 });

			const body = JSON.parse(calls[0].options.body as string);
			expect(body.ttl_seconds).toBe(3600);
		});

		test('should include project_id when provided', async () => {
			const mockData = {
				success: true,
				data: {
					message: {
						id: 'qmsg_proj1',
						offset: 0,
						published_at: '2026-02-13T00:00:00Z',
					},
				},
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
				success: true,
				data: {
					message: {
						id: 'qmsg_agent1',
						offset: 0,
						published_at: '2026-02-13T00:00:00Z',
					},
				},
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
				success: true,
				data: {
					message: {
						id: 'qmsg_sync1',
						offset: 0,
						published_at: '2026-02-13T00:00:00Z',
					},
				},
			};
			const { adapter, calls } = createMockAdapter([{ ok: true, data: mockData }]);

			const service = new QueueStorageService(baseUrl, adapter);
			await service.publish('my_queue', 'payload', { sync: true });

			expect(calls[0].url).toContain('?sync=true');
		});

		test('should not append sync query param when sync is not set', async () => {
			const mockData = {
				success: true,
				data: {
					message: {
						id: 'qmsg_nosync1',
						offset: 0,
						published_at: '2026-02-13T00:00:00Z',
					},
				},
			};
			const { adapter, calls } = createMockAdapter([{ ok: true, data: mockData }]);

			const service = new QueueStorageService(baseUrl, adapter);
			await service.publish('my_queue', 'payload');

			expect(calls[0].url).not.toContain('sync');
		});

		test('should URL-encode queue name', async () => {
			const mockData = {
				success: true,
				data: {
					message: {
						id: 'qmsg_enc1',
						offset: 0,
						published_at: '2026-02-13T00:00:00Z',
					},
				},
			};
			const { adapter, calls } = createMockAdapter([{ ok: true, data: mockData }]);

			const service = new QueueStorageService(baseUrl, adapter);
			await service.publish('my_queue', 'payload');

			expect(calls[0].url).toContain('/queue/messages/publish/my_queue');
		});

		test('should set content type to application/json', async () => {
			const mockData = {
				success: true,
				data: {
					message: {
						id: 'qmsg_ct1',
						offset: 0,
						published_at: '2026-02-13T00:00:00Z',
					},
				},
			};
			const { adapter, calls } = createMockAdapter([{ ok: true, data: mockData }]);

			const service = new QueueStorageService(baseUrl, adapter);
			await service.publish('my_queue', 'payload');

			expect(calls[0].options.contentType).toBe('application/json');
		});

		test('should set timeout signal', async () => {
			const mockData = {
				success: true,
				data: {
					message: {
						id: 'qmsg_sig1',
						offset: 0,
						published_at: '2026-02-13T00:00:00Z',
					},
				},
			};
			const { adapter, calls } = createMockAdapter([{ ok: true, data: mockData }]);

			const service = new QueueStorageService(baseUrl, adapter);
			await service.publish('my_queue', 'payload');

			expect(calls[0].options.signal).toBeDefined();
		});

		test('should set telemetry attributes', async () => {
			const mockData = {
				success: true,
				data: {
					message: {
						id: 'qmsg_tel1',
						offset: 0,
						published_at: '2026-02-13T00:00:00Z',
					},
				},
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
				success: true,
				data: {
					message: {
						id: 'qmsg_valid1',
						offset: 0,
						published_at: '2026-02-13T00:00:00Z',
					},
				},
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
				success: true,
				data: {
					message: {
						id: 'qmsg_ttl0',
						offset: 0,
						published_at: '2026-02-13T00:00:00Z',
					},
				},
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
				success: true,
				data: {
					message: {
						id: 'qmsg_hook1',
						offset: 0,
						published_at: '2026-02-13T00:00:00Z',
					},
				},
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
			expect(onBeforeCalls[0].url).toContain('/queue/messages/publish/my_queue');
		});
	});

	describe('onAfter hook', () => {
		test('should call onAfter on successful publish', async () => {
			const afterCalls: { status: number; hasError: boolean }[] = [];
			const mockData = {
				success: true,
				data: {
					message: {
						id: 'qmsg_after1',
						offset: 0,
						published_at: '2026-02-13T00:00:00Z',
					},
				},
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

	describe('createQueue', () => {
		test('should create queue and return result', async () => {
			const mockData = {
				success: true,
				data: { queue: { name: 'my_queue', queue_type: 'worker' } },
			};
			const { adapter, calls } = createMockAdapter([{ ok: true, data: mockData }]);
			const service = new QueueStorageService(baseUrl, adapter);
			const result = await service.createQueue('my_queue');
			expect(result.name).toBe('my_queue');
			expect(result.queueType).toBe('worker');
			expect(calls).toHaveLength(1);
			expect(calls[0].url).toContain('/queue/create');
			expect(calls[0].options.method).toBe('POST');
		});

		test('should create pubsub queue when specified', async () => {
			const mockData = {
				success: true,
				data: { queue: { name: 'events', queue_type: 'pubsub' } },
			};
			const { adapter, calls } = createMockAdapter([{ ok: true, data: mockData }]);
			const service = new QueueStorageService(baseUrl, adapter);
			const result = await service.createQueue('events', { queueType: 'pubsub' });
			expect(result.queueType).toBe('pubsub');
			const body = JSON.parse(calls[0].options.body as string);
			expect(body.queue_type).toBe('pubsub');
		});

		test('should default to worker queue type', async () => {
			const mockData = {
				success: true,
				data: { queue: { name: 'tasks', queue_type: 'worker' } },
			};
			const { adapter, calls } = createMockAdapter([{ ok: true, data: mockData }]);
			const service = new QueueStorageService(baseUrl, adapter);
			await service.createQueue('tasks');
			const body = JSON.parse(calls[0].options.body as string);
			expect(body.queue_type).toBe('worker');
		});

		test('should include description when provided', async () => {
			const mockData = {
				success: true,
				data: { queue: { name: 'my_queue', queue_type: 'worker' } },
			};
			const { adapter, calls } = createMockAdapter([{ ok: true, data: mockData }]);
			const service = new QueueStorageService(baseUrl, adapter);
			await service.createQueue('my_queue', { description: 'Test queue' });
			const body = JSON.parse(calls[0].options.body as string);
			expect(body.description).toBe('Test queue');
		});

		test('should include settings when provided', async () => {
			const mockData = {
				success: true,
				data: { queue: { name: 'my_queue', queue_type: 'worker' } },
			};
			const { adapter, calls } = createMockAdapter([{ ok: true, data: mockData }]);
			const service = new QueueStorageService(baseUrl, adapter);
			await service.createQueue('my_queue', {
				settings: {
					defaultTtlSeconds: 3600,
					defaultMaxRetries: 3,
					maxInFlightPerClient: 5,
				},
			});
			const body = JSON.parse(calls[0].options.body as string);
			expect(body.settings.default_ttl_seconds).toBe(3600);
			expect(body.settings.default_max_retries).toBe(3);
			expect(body.settings.max_in_flight_per_client).toBe(5);
		});

		test('should handle null defaultTtlSeconds in settings', async () => {
			const mockData = {
				success: true,
				data: { queue: { name: 'my_queue', queue_type: 'worker' } },
			};
			const { adapter, calls } = createMockAdapter([{ ok: true, data: mockData }]);
			const service = new QueueStorageService(baseUrl, adapter);
			await service.createQueue('my_queue', {
				settings: { defaultTtlSeconds: null },
			});
			const body = JSON.parse(calls[0].options.body as string);
			expect(body.settings.default_ttl_seconds).toBeNull();
		});

		test('should treat 409 as success (idempotent)', async () => {
			const { adapter, calls } = createMockAdapter([{ ok: false, status: 409 }]);
			const service = new QueueStorageService(baseUrl, adapter);
			const result = await service.createQueue('existing_queue', { queueType: 'pubsub' });
			expect(result.name).toBe('existing_queue');
			expect(result.queueType).toBe('pubsub');
			expect(calls).toHaveLength(1);
		});

		test('should cache known queues and skip API call on second create', async () => {
			const mockData = {
				success: true,
				data: { queue: { name: 'my_queue', queue_type: 'worker' } },
			};
			const { adapter, calls } = createMockAdapter([{ ok: true, data: mockData }]);
			const service = new QueueStorageService(baseUrl, adapter);

			// First call hits API
			await service.createQueue('my_queue');
			expect(calls).toHaveLength(1);

			// Second call should use cache (no additional API call)
			const result2 = await service.createQueue('my_queue');
			expect(calls).toHaveLength(1); // Still 1 — cached
			expect(result2.name).toBe('my_queue');
			expect(result2.queueType).toBe('worker');
		});

		test('should cache after 409 response', async () => {
			const { adapter, calls } = createMockAdapter([{ ok: false, status: 409 }]);
			const service = new QueueStorageService(baseUrl, adapter);

			// First call gets 409
			await service.createQueue('existing_queue');
			expect(calls).toHaveLength(1);

			// Second call should use cache
			await service.createQueue('existing_queue');
			expect(calls).toHaveLength(1); // Still 1 — cached
		});

		test('should throw ServiceException on server error', async () => {
			const { adapter } = createMockAdapter([
				{ ok: false, status: 500, body: { error: 'Internal Server Error' } },
			]);
			const service = new QueueStorageService(baseUrl, adapter);
			await expect(service.createQueue('my_queue')).rejects.toThrow(ServiceException);
		});

		test('should set content type to application/json', async () => {
			const mockData = {
				success: true,
				data: { queue: { name: 'my_queue', queue_type: 'worker' } },
			};
			const { adapter, calls } = createMockAdapter([{ ok: true, data: mockData }]);
			const service = new QueueStorageService(baseUrl, adapter);
			await service.createQueue('my_queue');
			expect(calls[0].options.contentType).toBe('application/json');
		});

		test('should set telemetry attributes', async () => {
			const mockData = {
				success: true,
				data: { queue: { name: 'my_queue', queue_type: 'worker' } },
			};
			const { adapter, calls } = createMockAdapter([{ ok: true, data: mockData }]);
			const service = new QueueStorageService(baseUrl, adapter);
			await service.createQueue('my_queue');
			expect(calls[0].options.telemetry?.name).toBe('agentuity.queue.create');
			expect(calls[0].options.telemetry?.attributes?.queueName).toBe('my_queue');
		});

		test('should set timeout signal', async () => {
			const mockData = {
				success: true,
				data: { queue: { name: 'my_queue', queue_type: 'worker' } },
			};
			const { adapter, calls } = createMockAdapter([{ ok: true, data: mockData }]);
			const service = new QueueStorageService(baseUrl, adapter);
			await service.createQueue('my_queue');
			expect(calls[0].options.signal).toBeDefined();
		});
	});

	describe('createQueue - validation', () => {
		test('should throw QueueValidationError for empty queue name', async () => {
			const { adapter } = createMockAdapter([]);
			const service = new QueueStorageService(baseUrl, adapter);
			await expect(service.createQueue('')).rejects.toThrow(QueueValidationError);
		});

		test('should throw QueueValidationError for queue name exceeding max length', async () => {
			const { adapter } = createMockAdapter([]);
			const service = new QueueStorageService(baseUrl, adapter);
			const longName = 'a'.repeat(257);
			await expect(service.createQueue(longName)).rejects.toThrow(QueueValidationError);
		});

		test('should throw QueueValidationError for invalid queue name characters', async () => {
			const { adapter } = createMockAdapter([]);
			const service = new QueueStorageService(baseUrl, adapter);
			await expect(service.createQueue('Invalid-Queue!')).rejects.toThrow(QueueValidationError);
		});

		test('should throw QueueValidationError for queue name starting with digit', async () => {
			const { adapter } = createMockAdapter([]);
			const service = new QueueStorageService(baseUrl, adapter);
			await expect(service.createQueue('1queue')).rejects.toThrow(QueueValidationError);
		});
	});

	describe('deleteQueue', () => {
		test('should delete queue successfully', async () => {
			const { adapter, calls } = createMockAdapter([{ ok: true, data: {} }]);
			const service = new QueueStorageService(baseUrl, adapter);
			await service.deleteQueue('my_queue');
			expect(calls).toHaveLength(1);
			expect(calls[0].url).toContain('/queue/delete/my_queue');
			expect(calls[0].options.method).toBe('DELETE');
		});

		test('should remove queue from known queues cache after delete', async () => {
			const mockData = {
				success: true,
				data: { queue: { name: 'my_queue', queue_type: 'worker' } },
			};
			const { adapter, calls } = createMockAdapter<unknown>([
				{ ok: true, data: mockData }, // createQueue response
				{ ok: true, data: {} }, // deleteQueue response
				{ ok: true, data: mockData }, // second createQueue response
			]);
			const service = new QueueStorageService(baseUrl, adapter);

			// Create queue (adds to cache)
			await service.createQueue('my_queue');
			expect(calls).toHaveLength(1);

			// Create again — should use cache
			await service.createQueue('my_queue');
			expect(calls).toHaveLength(1); // still 1, cached

			// Delete queue (removes from cache)
			await service.deleteQueue('my_queue');
			expect(calls).toHaveLength(2); // now 2

			// Create again — should NOT use cache (was cleared)
			await service.createQueue('my_queue');
			expect(calls).toHaveLength(3); // now 3, cache was cleared
		});

		test('should throw QueueNotFoundError on 404', async () => {
			const { adapter } = createMockAdapter([{ ok: false, status: 404 }]);
			const service = new QueueStorageService(baseUrl, adapter);
			await expect(service.deleteQueue('nonexistent_queue')).rejects.toThrow(QueueNotFoundError);
		});

		test('should throw ServiceException on server error', async () => {
			const { adapter } = createMockAdapter([
				{ ok: false, status: 500, body: { error: 'Internal Server Error' } },
			]);
			const service = new QueueStorageService(baseUrl, adapter);
			await expect(service.deleteQueue('my_queue')).rejects.toThrow(ServiceException);
		});

		test('should set telemetry attributes', async () => {
			const { adapter, calls } = createMockAdapter([{ ok: true, data: {} }]);
			const service = new QueueStorageService(baseUrl, adapter);
			await service.deleteQueue('my_queue');
			expect(calls[0].options.telemetry?.name).toBe('agentuity.queue.delete');
			expect(calls[0].options.telemetry?.attributes?.queueName).toBe('my_queue');
		});

		test('should set timeout signal', async () => {
			const { adapter, calls } = createMockAdapter([{ ok: true, data: {} }]);
			const service = new QueueStorageService(baseUrl, adapter);
			await service.deleteQueue('my_queue');
			expect(calls[0].options.signal).toBeDefined();
		});

		test('should not send request body', async () => {
			const { adapter, calls } = createMockAdapter([{ ok: true, data: {} }]);
			const service = new QueueStorageService(baseUrl, adapter);
			await service.deleteQueue('my_queue');
			expect(calls[0].options.body).toBeUndefined();
		});

		test('should URL-encode queue name', async () => {
			const { adapter, calls } = createMockAdapter([{ ok: true, data: {} }]);
			const service = new QueueStorageService(baseUrl, adapter);
			await service.deleteQueue('my_queue');
			expect(calls[0].url).toContain('/queue/delete/my_queue');
		});
	});

	describe('deleteQueue - validation', () => {
		test('should throw QueueValidationError for empty queue name', async () => {
			const { adapter } = createMockAdapter([]);
			const service = new QueueStorageService(baseUrl, adapter);
			await expect(service.deleteQueue('')).rejects.toThrow(QueueValidationError);
		});

		test('should throw QueueValidationError for queue name exceeding max length', async () => {
			const { adapter } = createMockAdapter([]);
			const service = new QueueStorageService(baseUrl, adapter);
			const longName = 'a'.repeat(257);
			await expect(service.deleteQueue(longName)).rejects.toThrow(QueueValidationError);
		});

		test('should throw QueueValidationError for invalid queue name characters', async () => {
			const { adapter } = createMockAdapter([]);
			const service = new QueueStorageService(baseUrl, adapter);
			await expect(service.deleteQueue('Invalid-Queue!')).rejects.toThrow(QueueValidationError);
		});

		test('should throw QueueValidationError for queue name starting with digit', async () => {
			const { adapter } = createMockAdapter([]);
			const service = new QueueStorageService(baseUrl, adapter);
			await expect(service.deleteQueue('1queue')).rejects.toThrow(QueueValidationError);
		});
	});

	describe('publish - response envelope handling (P0)', () => {
		test('should correctly unwrap API envelope format', async () => {
			const mockData = {
				success: true,
				data: {
					message: {
						id: 'qmsg_envelope_test',
						offset: 99,
						published_at: '2026-04-02T12:00:00Z',
					},
				},
			};
			const { adapter } = createMockAdapter([{ ok: true, data: mockData }]);
			const service = new QueueStorageService(baseUrl, adapter);
			const result = await service.publish('my_queue', 'test');

			expect(result.id).toBe('qmsg_envelope_test');
			expect(result.offset).toBe(99);
			expect(result.publishedAt).toBe('2026-04-02T12:00:00Z');
		});

		test('should handle flat response format (backward compat)', async () => {
			const mockData = {
				id: 'qmsg_flat_test',
				offset: 7,
				published_at: '2026-04-02T13:00:00Z',
			};
			const { adapter } = createMockAdapter([{ ok: true, data: mockData }]);
			const service = new QueueStorageService(baseUrl, adapter);
			const result = await service.publish('my_queue', 'test');

			expect(result.id).toBe('qmsg_flat_test');
			expect(result.offset).toBe(7);
			expect(result.publishedAt).toBe('2026-04-02T13:00:00Z');
		});

		test('should never return undefined fields (regression for #1330)', async () => {
			const mockData = {
				success: true,
				data: {
					message: {
						id: 'qmsg_no_undef',
						offset: 0,
						published_at: '2026-04-02T14:00:00Z',
					},
				},
			};
			const { adapter } = createMockAdapter([{ ok: true, data: mockData }]);
			const service = new QueueStorageService(baseUrl, adapter);
			const result = await service.publish('my_queue', 'test');

			expect(result.id).toBeDefined();
			expect(result.offset).toBeDefined();
			expect(result.publishedAt).toBeDefined();
			expect(JSON.stringify(result)).not.toBe('{}');
		});

		test('should return correct field types', async () => {
			const mockData = {
				success: true,
				data: {
					message: {
						id: 'qmsg_types_test',
						offset: 42,
						published_at: '2026-04-02T15:00:00Z',
					},
				},
			};
			const { adapter } = createMockAdapter([{ ok: true, data: mockData }]);
			const service = new QueueStorageService(baseUrl, adapter);
			const result = await service.publish('my_queue', 'test');

			expect(typeof result.id).toBe('string');
			expect(typeof result.offset).toBe('number');
			expect(typeof result.publishedAt).toBe('string');
		});

		test('should throw on response missing required fields', async () => {
			const mockData = {
				success: true,
				data: {
					message: {},
				},
			};
			const { adapter } = createMockAdapter([{ ok: true, data: mockData }]);
			const service = new QueueStorageService(baseUrl, adapter);

			await expect(service.publish('my_queue', 'test')).rejects.toThrow();
		});

		test('should throw on completely empty response body', async () => {
			const mockData = {};
			const { adapter } = createMockAdapter([{ ok: true, data: mockData }]);
			const service = new QueueStorageService(baseUrl, adapter);

			await expect(service.publish('my_queue', 'test')).rejects.toThrow();
		});
	});

	describe('publish - field mapping (P1)', () => {
		test('should map published_at to publishedAt', async () => {
			const timestamp = '2026-04-02T16:30:45.123Z';
			const mockData = {
				success: true,
				data: {
					message: {
						id: 'qmsg_map1',
						offset: 1,
						published_at: timestamp,
					},
				},
			};
			const { adapter } = createMockAdapter([{ ok: true, data: mockData }]);
			const service = new QueueStorageService(baseUrl, adapter);
			const result = await service.publish('my_queue', 'test');

			expect(result.publishedAt).toBe(timestamp);
			expect((result as Record<string, unknown>).published_at).toBeUndefined();
		});

		test('should ignore extra fields from server response', async () => {
			const mockData = {
				success: true,
				data: {
					message: {
						id: 'qmsg_extra',
						queue_id: 'queue_should_be_ignored',
						offset: 5,
						payload: { data: true },
						size: 42,
						state: 'pending',
						delivery_attempts: 0,
						published_at: '2026-04-02T17:00:00Z',
						created_at: '2026-04-02T17:00:00Z',
					},
				},
			};
			const { adapter } = createMockAdapter([{ ok: true, data: mockData }]);
			const service = new QueueStorageService(baseUrl, adapter);
			const result = await service.publish('my_queue', 'test');

			expect(result.id).toBe('qmsg_extra');
			expect(result.offset).toBe(5);
			expect(result.publishedAt).toBe('2026-04-02T17:00:00Z');
			// Should only have the 3 expected fields
			const keys = Object.keys(result);
			expect(keys).toContain('id');
			expect(keys).toContain('offset');
			expect(keys).toContain('publishedAt');
			expect(keys).not.toContain('queue_id');
			expect(keys).not.toContain('state');
			expect(keys).not.toContain('size');
		});

		test('should handle offset of -1 for async publish', async () => {
			const mockData = {
				success: true,
				data: {
					message: {
						id: 'qmsg_async',
						offset: -1,
						published_at: '2026-04-02T18:00:00Z',
					},
				},
			};
			const { adapter } = createMockAdapter([{ ok: true, data: mockData }]);
			const service = new QueueStorageService(baseUrl, adapter);
			const result = await service.publish('my_queue', 'test');

			expect(result.offset).toBe(-1);
		});

		test('should handle offset of 0', async () => {
			const mockData = {
				success: true,
				data: {
					message: {
						id: 'qmsg_zero',
						offset: 0,
						published_at: '2026-04-02T18:30:00Z',
					},
				},
			};
			const { adapter } = createMockAdapter([{ ok: true, data: mockData }]);
			const service = new QueueStorageService(baseUrl, adapter);
			const result = await service.publish('my_queue', 'test');

			expect(result.offset).toBe(0);
		});
	});

	describe('publish - schema validation (P1)', () => {
		test('should return result matching QueuePublishResultSchema', async () => {
			const mockData = {
				success: true,
				data: {
					message: {
						id: 'qmsg_schema_test',
						offset: 10,
						published_at: '2026-04-02T19:00:00Z',
					},
				},
			};
			const { adapter } = createMockAdapter([{ ok: true, data: mockData }]);
			const service = new QueueStorageService(baseUrl, adapter);
			const result = await service.publish('my_queue', 'test');

			// Validate against the schema
			const validation = QueuePublishResultSchema.safeParse(result);
			expect(validation.success).toBe(true);
		});

		test('should serialize to non-empty JSON', async () => {
			const mockData = {
				success: true,
				data: {
					message: {
						id: 'qmsg_json_test',
						offset: 20,
						published_at: '2026-04-02T19:30:00Z',
					},
				},
			};
			const { adapter } = createMockAdapter([{ ok: true, data: mockData }]);
			const service = new QueueStorageService(baseUrl, adapter);
			const result = await service.publish('my_queue', 'test');

			const json = JSON.parse(JSON.stringify(result));
			expect(json.id).toBe('qmsg_json_test');
			expect(json.offset).toBe(20);
			expect(json.publishedAt).toBe('2026-04-02T19:30:00Z');
		});
	});

	describe('createQueue - response envelope handling (P0)', () => {
		test('should correctly unwrap API envelope format', async () => {
			const mockData = {
				success: true,
				data: {
					queue: {
						name: 'envelope_queue',
						queue_type: 'pubsub',
						id: 'queue_xxx',
					},
				},
			};
			const { adapter } = createMockAdapter([{ ok: true, data: mockData }]);
			const service = new QueueStorageService(baseUrl, adapter);
			const result = await service.createQueue('envelope_queue', { queueType: 'pubsub' });

			expect(result.name).toBe('envelope_queue');
			expect(result.queueType).toBe('pubsub');
		});

		test('should handle flat response format (backward compat)', async () => {
			const mockData = { name: 'flat_queue', queue_type: 'worker' };
			const { adapter } = createMockAdapter([{ ok: true, data: mockData }]);
			const service = new QueueStorageService(baseUrl, adapter);
			const result = await service.createQueue('flat_queue');

			expect(result.name).toBe('flat_queue');
			expect(result.queueType).toBe('worker');
		});

		test('should use server values, not fallback defaults (regression)', async () => {
			const mockData = {
				success: true,
				data: {
					queue: {
						name: 'server_name',
						queue_type: 'pubsub',
					},
				},
			};
			const { adapter } = createMockAdapter([{ ok: true, data: mockData }]);
			const service = new QueueStorageService(baseUrl, adapter);
			// Pass different defaults to verify server values take precedence
			const result = await service.createQueue('server_name', { queueType: 'worker' });

			expect(result.name).toBe('server_name');
			expect(result.queueType).toBe('pubsub'); // Server says pubsub, not the default worker
		});
	});
});
