import { describe, test, expect } from 'bun:test';
import { KeyValueStorageService } from '../src/services/keyvalue.ts';
import { createMockAdapter } from '@agentuity/test-utils';
import { ServiceException } from '../src/services/exception.ts';

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

		test('should return expiresAt when X-Expires-At header is present', async () => {
			const mockData = { foo: 'bar' };
			const expiresAt = '2026-02-01T12:00:00Z';
			const { adapter } = createMockAdapter([
				{
					ok: true,
					data: mockData,
					status: 200,
					headers: { 'x-expires-at': expiresAt },
				},
			]);

			const service = new KeyValueStorageService(baseUrl, adapter);
			const result = await service.get('mystore', 'mykey');

			expect(result.exists).toBe(true);
			if (result.exists) {
				expect(result.data).toEqual(mockData);
				expect(result.expiresAt).toBe(expiresAt);
			}
		});

		test('should not include expiresAt when X-Expires-At header is absent (no expiration)', async () => {
			const mockData = { foo: 'bar' };
			const { adapter } = createMockAdapter([
				{
					ok: true,
					data: mockData,
					status: 200,
					// No x-expires-at header means no expiration
				},
			]);

			const service = new KeyValueStorageService(baseUrl, adapter);
			const result = await service.get('mystore', 'mykey');

			expect(result.exists).toBe(true);
			if (result.exists) {
				expect(result.data).toEqual(mockData);
				expect(result.expiresAt).toBeUndefined();
			}
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
			expect(calls[0].options?.contentType).toBe('application/json');
		});

		test('should set boolean value', async () => {
			const { adapter, calls } = createMockAdapter([{ ok: true }]);

			const service = new KeyValueStorageService(baseUrl, adapter);
			await service.set('mystore', 'mykey', true);

			expect(calls[0].options?.body).toBe('true');
			expect(calls[0].options?.contentType).toBe('application/json');
		});

		test('should include ttl in url when provided', async () => {
			const { adapter, calls } = createMockAdapter([{ ok: true }]);

			const service = new KeyValueStorageService(baseUrl, adapter);
			await service.set('mystore', 'mykey', 'value', { ttl: 3600 });

			expect(calls[0].url).toBe(`${baseUrl}/kv/2025-03-17/mystore/mykey/3600`);
		});

		test('should not include ttl in url when not specified (uses namespace default)', async () => {
			const { adapter, calls } = createMockAdapter([{ ok: true }]);

			const service = new KeyValueStorageService(baseUrl, adapter);
			await service.set('mystore', 'mykey', 'value');

			// TTL should not be in the URL when not specified (server uses namespace default)
			expect(calls[0].url).toBe(`${baseUrl}/kv/2025-03-17/mystore/mykey`);
		});

		test('should send ttl=0 when ttl is null (no expiration)', async () => {
			const { adapter, calls } = createMockAdapter([{ ok: true }]);

			const service = new KeyValueStorageService(baseUrl, adapter);
			await service.set('mystore', 'mykey', 'value', { ttl: null });

			// null should be converted to 0 (no expiration)
			expect(calls[0].url).toBe(`${baseUrl}/kv/2025-03-17/mystore/mykey/0`);
		});

		test('should send ttl=0 when ttl is 0 (no expiration)', async () => {
			const { adapter, calls } = createMockAdapter([{ ok: true }]);

			const service = new KeyValueStorageService(baseUrl, adapter);
			await service.set('mystore', 'mykey', 'value', { ttl: 0 });

			expect(calls[0].url).toBe(`${baseUrl}/kv/2025-03-17/mystore/mykey/0`);
		});

		test('should send low ttl values to server (server clamps to minimum)', async () => {
			const { adapter, calls } = createMockAdapter([{ ok: true }]);

			const service = new KeyValueStorageService(baseUrl, adapter);
			await service.set('mystore', 'mykey', 'value', { ttl: 30 });

			// Low TTL values are sent to server, which clamps them to minimum (60 seconds)
			expect(calls[0].url).toBe(`${baseUrl}/kv/2025-03-17/mystore/mykey/30`);
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

	describe('search', () => {
		test('should deserialize JSON values from base64', async () => {
			const jsonObj = { name: 'Alice', age: 30 };
			const base64Value = btoa(JSON.stringify(jsonObj));
			const { adapter } = createMockAdapter([
				{
					ok: true,
					data: {
						'user:123': {
							value: base64Value,
							contentType: 'application/json',
							size: JSON.stringify(jsonObj).length,
							firstUsed: 1709312345000,
							lastUsed: 1709312345000,
							count: 1,
						},
					},
				},
			]);

			const service = new KeyValueStorageService(baseUrl, adapter);
			const results = await service.search<typeof jsonObj>('users', 'user:');

			expect(results['user:123']).toBeDefined();
			expect(results['user:123']!.value).toEqual(jsonObj);
			expect(typeof results['user:123']!.value).toBe('object');
		});

		test('should deserialize text values from base64', async () => {
			const textValue = 'hello world';
			const base64Value = btoa(textValue);
			const { adapter } = createMockAdapter([
				{
					ok: true,
					data: {
						'msg:1': {
							value: base64Value,
							contentType: 'text/plain',
							size: textValue.length,
							firstUsed: null,
							lastUsed: null,
							count: null,
						},
					},
				},
			]);

			const service = new KeyValueStorageService(baseUrl, adapter);
			const results = await service.search<string>('messages', 'msg:');

			expect(results['msg:1']!.value).toBe(textValue);
		});

		test('should deserialize binary values from base64 as ArrayBuffer', async () => {
			const binaryData = new Uint8Array([0x00, 0x01, 0x02, 0xff]);
			const base64Value = btoa(String.fromCharCode(...binaryData));
			const { adapter } = createMockAdapter([
				{
					ok: true,
					data: {
						'bin:1': {
							value: base64Value,
							contentType: 'application/octet-stream',
							size: binaryData.length,
							firstUsed: null,
							lastUsed: null,
							count: null,
						},
					},
				},
			]);

			const service = new KeyValueStorageService(baseUrl, adapter);
			const results = await service.search<ArrayBuffer>('blobs', 'bin:');

			const resultValue = results['bin:1']!.value;
			expect(resultValue).toBeInstanceOf(ArrayBuffer);
			const resultBytes = new Uint8Array(resultValue);
			expect(resultBytes).toEqual(binaryData);
		});

		test('should return empty object when no results', async () => {
			const { adapter } = createMockAdapter([{ ok: true, data: {} }]);

			const service = new KeyValueStorageService(baseUrl, adapter);
			const results = await service.search('empty', 'nope');

			expect(Object.keys(results)).toHaveLength(0);
		});

		test('should pass through already-parsed values unchanged', async () => {
			const jsonObj = { name: 'Bob' };
			const { adapter } = createMockAdapter([
				{
					ok: true,
					data: {
						'key:1': {
							value: jsonObj,
							contentType: 'application/json',
							size: 14,
							firstUsed: null,
							lastUsed: null,
							count: null,
						},
					},
				},
			]);

			const service = new KeyValueStorageService(baseUrl, adapter);
			const results = await service.search<typeof jsonObj>('ns', 'key:');

			expect(results['key:1']!.value).toEqual(jsonObj);
		});

		test('should handle multiple results', async () => {
			const obj1 = { id: 1 };
			const obj2 = { id: 2 };
			const { adapter } = createMockAdapter([
				{
					ok: true,
					data: {
						'item:1': {
							value: btoa(JSON.stringify(obj1)),
							contentType: 'application/json',
							size: 8,
							firstUsed: 1000,
							lastUsed: 2000,
							count: 5,
						},
						'item:2': {
							value: btoa(JSON.stringify(obj2)),
							contentType: 'application/json',
							size: 8,
							firstUsed: 1000,
							lastUsed: 3000,
							count: 3,
						},
					},
				},
			]);

			const service = new KeyValueStorageService(baseUrl, adapter);
			const results = await service.search<{ id: number }>('items', 'item:');

			expect(Object.keys(results)).toHaveLength(2);
			expect(results['item:1']!.value).toEqual(obj1);
			expect(results['item:2']!.value).toEqual(obj2);
		});

		test('should encode special characters in name and keyword', async () => {
			const { adapter, calls } = createMockAdapter([{ ok: true, data: {} }]);

			const service = new KeyValueStorageService(baseUrl, adapter);
			await service.search('my store', 'my/keyword');

			expect(calls[0].url).toBe(`${baseUrl}/kv/2025-03-17/search/my%20store/my%2Fkeyword`);
		});

		test('should throw ServiceException on error response', async () => {
			const { adapter } = createMockAdapter([
				{ ok: false, status: 500, body: { error: 'Internal Server Error' } },
			]);

			const service = new KeyValueStorageService(baseUrl, adapter);

			await expect(service.search('mystore', 'key')).rejects.toThrow(ServiceException);
		});

		test('should set timeout signal', async () => {
			const { adapter, calls } = createMockAdapter([{ ok: true, data: {} }]);

			const service = new KeyValueStorageService(baseUrl, adapter);
			await service.search('mystore', 'key');

			expect(calls[0].options?.signal).toBeDefined();
		});

		test('should leave value as-is when base64 decoding fails', async () => {
			const invalidBase64 = '!!!not-valid-base64!!!';
			const { adapter } = createMockAdapter([
				{
					ok: true,
					data: {
						'key:1': {
							value: invalidBase64,
							contentType: 'application/json',
							size: 10,
							firstUsed: null,
							lastUsed: null,
							count: null,
						},
					},
				},
			]);

			const service = new KeyValueStorageService(baseUrl, adapter);
			const results = await service.search<string>('ns', 'key:');

			// Value should be left as the original string when decoding fails
			expect(results['key:1']!.value).toBe(invalidBase64);
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

	describe('getNamespaces', () => {
		test('should return array of namespace names', async () => {
			const { adapter, calls } = createMockAdapter([
				{ ok: true, data: ['products', 'users', 'sessions'] },
			]);

			const service = new KeyValueStorageService(baseUrl, adapter);
			const namespaces = await service.getNamespaces();

			expect(namespaces).toHaveLength(3);
			expect(namespaces).toContain('products');
			expect(namespaces).toContain('users');
			expect(namespaces).toContain('sessions');
			expect(calls[0].url).toBe(`${baseUrl}/kv/2025-03-17/namespaces`);
			expect(calls[0].options.method).toBe('GET');
		});

		test('should return empty array when no namespaces exist', async () => {
			const { adapter } = createMockAdapter([{ ok: true, data: [] }]);

			const service = new KeyValueStorageService(baseUrl, adapter);
			const namespaces = await service.getNamespaces();

			expect(namespaces).toHaveLength(0);
		});

		test('should throw ServiceException on error', async () => {
			const { adapter } = createMockAdapter([
				{ ok: false, status: 500, body: { error: 'Internal Server Error' } },
			]);

			const service = new KeyValueStorageService(baseUrl, adapter);
			await expect(service.getNamespaces()).rejects.toThrow(ServiceException);
		});
	});

	describe('getAllStats with pagination', () => {
		test('should return flat map without pagination params', async () => {
			const { adapter, calls } = createMockAdapter([
				{
					ok: true,
					data: {
						products: { sum: 1024, count: 10 },
						users: { sum: 2048, count: 20 },
					},
				},
			]);

			const service = new KeyValueStorageService(baseUrl, adapter);
			const result = await service.getAllStats();

			expect(calls[0].url).toBe(`${baseUrl}/kv/2025-03-17/stats`);
			expect(calls[0].url).not.toContain('limit=');
			expect('namespaces' in result).toBe(false);
			expect(Object.keys(result)).toContain('products');
		});

		test('should return paginated response with pagination params', async () => {
			const { adapter, calls } = createMockAdapter([
				{
					ok: true,
					data: {
						namespaces: {
							products: { sum: 1024, count: 10 },
							users: { sum: 2048, count: 20 },
						},
						total: 100,
						limit: 10,
						offset: 0,
						hasMore: true,
					},
				},
			]);

			const service = new KeyValueStorageService(baseUrl, adapter);
			const result = await service.getAllStats({ limit: 10, offset: 0 });

			expect(calls[0].url).toContain('limit=10');
			expect(calls[0].url).toContain('offset=0');
			expect('namespaces' in result).toBe(true);
			if ('namespaces' in result) {
				expect(result.total).toBe(100);
				expect(result.hasMore).toBe(true);
				expect(result.limit).toBe(10);
				expect(result.offset).toBe(0);
			}
		});
	});

	describe('createNamespace with TTL', () => {
		test('should create namespace without TTL params', async () => {
			const { adapter, calls } = createMockAdapter([{ ok: true }]);

			const service = new KeyValueStorageService(baseUrl, adapter);
			await service.createNamespace('mystore');

			expect(calls[0].url).toBe(`${baseUrl}/kv/2025-03-17/mystore`);
			expect(calls[0].options.method).toBe('POST');
			expect(calls[0].options.body).toBeUndefined();
		});

		test('should create namespace with default TTL', async () => {
			const { adapter, calls } = createMockAdapter([{ ok: true }]);

			const service = new KeyValueStorageService(baseUrl, adapter);
			await service.createNamespace('mystore', { defaultTTLSeconds: 3600 });

			expect(calls[0].url).toBe(`${baseUrl}/kv/2025-03-17/mystore`);
			expect(calls[0].options.method).toBe('POST');
			expect(calls[0].options.body).toBe(JSON.stringify({ default_ttl_seconds: 3600 }));
			expect(calls[0].options.contentType).toBe('application/json');
		});

		test('should create namespace with no expiration (TTL = 0)', async () => {
			const { adapter, calls } = createMockAdapter([{ ok: true }]);

			const service = new KeyValueStorageService(baseUrl, adapter);
			await service.createNamespace('mystore', { defaultTTLSeconds: 0 });

			expect(calls[0].options.body).toBe(JSON.stringify({ default_ttl_seconds: 0 }));
		});
	});
});
