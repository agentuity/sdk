import { describe, test, expect } from 'bun:test';
import { KeyValueStorageService } from '../src/services/keyvalue';
import { createMockAdapter } from '@agentuity/test-utils';
import { ServiceException } from '../src/services/exception';

describe('KeyValueStorageService', () => {
	const baseUrl = 'https://api.example.com';

	describe('get', () => {
		test('should return data when key exists', async () => {
			const mockData = { foo: 'bar' };
			const { adapter, calls } = createMockAdapter([{ ok: true, data: mockData, status: 200 }]);

			const service = new KeyValueStorageService(baseUrl, adapter);
			const result = await service.get('mystore', 'mykey');

			expect(result.exists).toBe(true);
			if (result.exists) {
				expect(result.data).toEqual(mockData);
			}
			expect(calls).toHaveLength(1);
			expect(calls[0].url).toBe(`${baseUrl}/kv/2025-03-17/mystore/mykey`);
			expect(calls[0].options?.method).toBe('GET');
		});

		test('should return not found when key does not exist', async () => {
			const { adapter, calls } = createMockAdapter([{ ok: false, status: 404 }]);

			const service = new KeyValueStorageService(baseUrl, adapter);
			const result = await service.get('mystore', 'missing');

			expect(result.exists).toBe(false);
			expect(calls).toHaveLength(1);
			expect(calls[0].url).toBe(`${baseUrl}/kv/2025-03-17/mystore/missing`);
		});

		test('should encode special characters in name and key', async () => {
			const { adapter, calls } = createMockAdapter([{ ok: true, data: 'test' }]);

			const service = new KeyValueStorageService(baseUrl, adapter);
			await service.get('my store', 'my/key');

			expect(calls[0].url).toBe(`${baseUrl}/kv/2025-03-17/my%20store/my%2Fkey`);
		});

		test('should throw ServiceException on error response', async () => {
			const { adapter } = createMockAdapter([
				{ ok: false, status: 500, body: { error: 'Internal Server Error' } },
			]);

			const service = new KeyValueStorageService(baseUrl, adapter);

			await expect(service.get('mystore', 'mykey')).rejects.toThrow(ServiceException);
		});

		test('should set timeout signal', async () => {
			const { adapter, calls } = createMockAdapter([{ ok: true, data: 'test' }]);

			const service = new KeyValueStorageService(baseUrl, adapter);
			await service.get('mystore', 'mykey');

			expect(calls[0].options?.signal).toBeDefined();
		});
	});

	describe('set', () => {
		test('should set string value', async () => {
			const { adapter, calls } = createMockAdapter([{ ok: true }]);

			const service = new KeyValueStorageService(baseUrl, adapter);
			await service.set('mystore', 'mykey', 'myvalue');

			expect(calls).toHaveLength(1);
			expect(calls[0].url).toBe(`${baseUrl}/kv/2025-03-17/mystore/mykey`);
			expect(calls[0].options?.method).toBe('PUT');
			expect(calls[0].options?.body).toBe('myvalue');
			expect(calls[0].options?.contentType).toBe('text/plain');
		});

		test('should set object value', async () => {
			const { adapter, calls } = createMockAdapter([{ ok: true }]);

			const service = new KeyValueStorageService(baseUrl, adapter);
			const obj = { foo: 'bar', num: 42 };
			await service.set('mystore', 'mykey', obj);

			expect(calls[0].options?.body).toBe(JSON.stringify(obj));
			expect(calls[0].options?.contentType).toBe('application/json');
		});

		test('should set number value', async () => {
			const { adapter, calls } = createMockAdapter([{ ok: true }]);

			const service = new KeyValueStorageService(baseUrl, adapter);
			await service.set('mystore', 'mykey', 123);

			expect(calls[0].options?.body).toBe('123');
			expect(calls[0].options?.contentType).toBe('text/plain');
		});

		test('should set boolean value', async () => {
			const { adapter, calls } = createMockAdapter([{ ok: true }]);

			const service = new KeyValueStorageService(baseUrl, adapter);
			await service.set('mystore', 'mykey', true);

			expect(calls[0].options?.body).toBe('true');
			expect(calls[0].options?.contentType).toBe('text/plain');
		});

		test('should include ttl in url when provided', async () => {
			const { adapter, calls } = createMockAdapter([{ ok: true }]);

			const service = new KeyValueStorageService(baseUrl, adapter);
			await service.set('mystore', 'mykey', 'value', { ttl: 3600 });

			expect(calls[0].url).toBe(`${baseUrl}/kv/2025-03-17/mystore/mykey/3600`);
		});

		test('should throw error when ttl is less than 60 seconds', async () => {
			const { adapter } = createMockAdapter([{ ok: true }]);

			const service = new KeyValueStorageService(baseUrl, adapter);

			await expect(service.set('mystore', 'mykey', 'value', { ttl: 30 })).rejects.toThrow(
				'ttl for keyvalue set must be at least 60 seconds, got 30'
			);
		});

		test('should use custom contentType when provided', async () => {
			const { adapter, calls } = createMockAdapter([{ ok: true }]);

			const service = new KeyValueStorageService(baseUrl, adapter);
			await service.set('mystore', 'mykey', 'value', { contentType: 'text/html' });

			expect(calls[0].options?.contentType).toBe('text/html');
		});

		test('should encode special characters in name and key', async () => {
			const { adapter, calls } = createMockAdapter([{ ok: true }]);

			const service = new KeyValueStorageService(baseUrl, adapter);
			await service.set('my store', 'my/key', 'value');

			expect(calls[0].url).toBe(`${baseUrl}/kv/2025-03-17/my%20store/my%2Fkey`);
		});

		test('should throw ServiceException on error response', async () => {
			const { adapter } = createMockAdapter([
				{ ok: false, status: 400, body: { error: 'Bad Request' } },
			]);

			const service = new KeyValueStorageService(baseUrl, adapter);

			await expect(service.set('mystore', 'mykey', 'value')).rejects.toThrow(ServiceException);
		});

		test('should set timeout signal', async () => {
			const { adapter, calls } = createMockAdapter([{ ok: true }]);

			const service = new KeyValueStorageService(baseUrl, adapter);
			await service.set('mystore', 'mykey', 'value');

			expect(calls[0].options?.signal).toBeDefined();
		});
	});

	describe('delete', () => {
		test('should delete key', async () => {
			const { adapter, calls } = createMockAdapter([{ ok: true }]);

			const service = new KeyValueStorageService(baseUrl, adapter);
			await service.delete('mystore', 'mykey');

			expect(calls).toHaveLength(1);
			expect(calls[0].url).toBe(`${baseUrl}/kv/2025-03-17/mystore/mykey`);
			expect(calls[0].options?.method).toBe('DELETE');
		});

		test('should encode special characters in name and key', async () => {
			const { adapter, calls } = createMockAdapter([{ ok: true }]);

			const service = new KeyValueStorageService(baseUrl, adapter);
			await service.delete('my store', 'my/key');

			expect(calls[0].url).toBe(`${baseUrl}/kv/2025-03-17/my%20store/my%2Fkey`);
		});

		test('should throw ServiceException on error response', async () => {
			const { adapter } = createMockAdapter([
				{ ok: false, status: 403, body: { error: 'Forbidden' } },
			]);

			const service = new KeyValueStorageService(baseUrl, adapter);

			await expect(service.delete('mystore', 'mykey')).rejects.toThrow(ServiceException);
		});

		test('should set timeout signal', async () => {
			const { adapter, calls } = createMockAdapter([{ ok: true }]);

			const service = new KeyValueStorageService(baseUrl, adapter);
			await service.delete('mystore', 'mykey');

			expect(calls[0].options?.signal).toBeDefined();
		});
	});

	describe('onBefore hook', () => {
		test('should call onBefore for get operation', async () => {
			const onBeforeCalls: { url: string; method: string }[] = [];
			const { adapter, beforeCalls } = createMockAdapter([{ ok: true, data: { foo: 'bar' } }], {
				onBefore: async (url, options, invoke) => {
					onBeforeCalls.push({ url, method: options.method });
					await invoke();
				},
			});

			const service = new KeyValueStorageService(baseUrl, adapter);
			await service.get('mystore', 'mykey');

			expect(beforeCalls).toHaveLength(1);
			expect(onBeforeCalls).toHaveLength(1);
			expect(onBeforeCalls[0].method).toBe('GET');
			expect(onBeforeCalls[0].url).toBe(`${baseUrl}/kv/2025-03-17/mystore/mykey`);
		});

		test('should call onBefore for set operation', async () => {
			const onBeforeCalls: { url: string; method: string }[] = [];
			const { adapter, beforeCalls } = createMockAdapter([{ ok: true }], {
				onBefore: async (url, options, invoke) => {
					onBeforeCalls.push({ url, method: options.method });
					await invoke();
				},
			});

			const service = new KeyValueStorageService(baseUrl, adapter);
			await service.set('mystore', 'mykey', 'value');

			expect(beforeCalls).toHaveLength(1);
			expect(onBeforeCalls[0].method).toBe('PUT');
		});

		test('should call onBefore for delete operation', async () => {
			const onBeforeCalls: { url: string; method: string }[] = [];
			const { adapter, beforeCalls } = createMockAdapter([{ ok: true }], {
				onBefore: async (url, options, invoke) => {
					onBeforeCalls.push({ url, method: options.method });
					await invoke();
				},
			});

			const service = new KeyValueStorageService(baseUrl, adapter);
			await service.delete('mystore', 'mykey');

			expect(beforeCalls).toHaveLength(1);
			expect(onBeforeCalls[0].method).toBe('DELETE');
		});

		test('should allow onBefore to modify request', async () => {
			let modifiedUrl = '';
			const { adapter } = createMockAdapter([{ ok: true, data: 'test' }], {
				onBefore: async (url, options, invoke) => {
					modifiedUrl = url + '?modified=true';
					await invoke();
				},
			});

			const service = new KeyValueStorageService(baseUrl, adapter);
			await service.get('mystore', 'mykey');

			expect(modifiedUrl).toContain('modified=true');
		});

		test('should pass mutated headers from onBefore to server', async () => {
			const { adapter, calls } = createMockAdapter([{ ok: true, data: { foo: 'bar' } }], {
				onBefore: async (url, options, invoke) => {
					options.headers = {
						...options.headers,
						'X-Custom-Header': 'test-value',
						Authorization: 'Bearer token123',
					};
					await invoke();
				},
			});

			const service = new KeyValueStorageService(baseUrl, adapter);
			await service.get('mystore', 'mykey');

			expect(calls).toHaveLength(1);
			expect(calls[0].options.headers).toBeDefined();
			expect(calls[0].options.headers?.['X-Custom-Header']).toBe('test-value');
			expect(calls[0].options.headers?.['Authorization']).toBe('Bearer token123');
		});
	});

	describe('onAfter hook', () => {
		test('should call onAfter on successful get', async () => {
			const afterCalls: { status: number; hasError: boolean }[] = [];
			const { adapter } = createMockAdapter([{ ok: true, data: { foo: 'bar' } }], {
				onAfter: async (response, error) => {
					afterCalls.push({ status: response.status, hasError: !!error });
				},
			});

			const service = new KeyValueStorageService(baseUrl, adapter);
			await service.get('mystore', 'mykey');

			expect(afterCalls).toHaveLength(1);
			expect(afterCalls[0].status).toBe(200);
			expect(afterCalls[0].hasError).toBe(false);
		});

		test('should call onAfter on successful set', async () => {
			const afterCalls: Response[] = [];
			const { adapter } = createMockAdapter([{ ok: true }], {
				onAfter: async (response) => {
					afterCalls.push(response);
				},
			});

			const service = new KeyValueStorageService(baseUrl, adapter);
			await service.set('mystore', 'mykey', 'value');

			expect(afterCalls).toHaveLength(1);
			expect(afterCalls[0].status).toBe(200);
		});

		test('should call onAfter on error response', async () => {
			const afterCalls: { status: number; hasError: boolean }[] = [];
			const { adapter } = createMockAdapter([{ ok: false, status: 500 }], {
				onAfter: async (response, error) => {
					afterCalls.push({ status: response.status, hasError: !!error });
				},
			});

			const service = new KeyValueStorageService(baseUrl, adapter);
			await service.get('mystore', 'mykey').catch(() => ({ exists: false }));

			expect(afterCalls).toHaveLength(1);
			expect(afterCalls[0].status).toBe(500);
			expect(afterCalls[0].hasError).toBe(true);
		});

		test('should receive error in onAfter when request fails', async () => {
			let receivedError: Error | undefined;
			const { adapter } = createMockAdapter(
				[{ ok: false, status: 403, statusText: 'Forbidden' }],
				{
					onAfter: async (response, error) => {
						receivedError = error;
					},
				}
			);

			const service = new KeyValueStorageService(baseUrl, adapter);
			await service.delete('mystore', 'mykey').catch(() => {});

			expect(receivedError).toBeDefined();
			expect(receivedError?.message).toBe('Forbidden');
		});
	});

	describe('onBefore and onAfter combined', () => {
		test('should call both hooks in correct order', async () => {
			const executionOrder: string[] = [];
			const { adapter } = createMockAdapter([{ ok: true, data: 'test' }], {
				onBefore: async (url, options, invoke) => {
					executionOrder.push('before-start');
					await invoke();
					executionOrder.push('before-end');
				},
				onAfter: async () => {
					executionOrder.push('after');
				},
			});

			const service = new KeyValueStorageService(baseUrl, adapter);
			await service.get('mystore', 'mykey');

			expect(executionOrder).toEqual(['before-start', 'after', 'before-end']);
		});

		test('should handle telemetry metadata in hooks', async () => {
			let capturedTelemetry: { name: string; attributes?: Record<string, string> } | undefined;
			const { adapter } = createMockAdapter([{ ok: true }], {
				onBefore: async (url, options, invoke) => {
					capturedTelemetry = options.telemetry;
					await invoke();
				},
			});

			const service = new KeyValueStorageService(baseUrl, adapter);
			await service.set('mystore', 'mykey', 'value', { ttl: 300 });

			expect(capturedTelemetry).toBeDefined();
			expect(capturedTelemetry?.name).toBe('agentuity.keyvalue.set');
			expect(capturedTelemetry?.attributes?.name).toBe('mystore');
			expect(capturedTelemetry?.attributes?.key).toBe('mykey');
		});
	});
});
