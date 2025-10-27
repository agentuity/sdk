import { describe, expect, test } from 'bun:test';
import { ObjectStorageService } from '../objectstore';
import { createMockAdapter } from './mock-adapter';

const baseUrl = 'https://test.agentuity.ai';

describe('ObjectStorageService', () => {
	describe('get', () => {
		test('should get an object successfully', async () => {
			const testData = new TextEncoder().encode('Hello, world!');
			const { adapter, calls } = createMockAdapter([
				{
					ok: true,
					data: testData.buffer,
					headers: { 'content-type': 'text/plain' },
				},
			]);

			const service = new ObjectStorageService(baseUrl, adapter);
			const result = await service.get('test-bucket', 'test-key');

			expect(calls).toHaveLength(1);
			expect(calls[0].url).toBe(`${baseUrl}/object/2025-03-17/test-bucket/test-key`);
			expect(calls[0].options.method).toBe('GET');
			expect(calls[0].options.telemetry?.name).toBe('agentuity.objectstore.get');

			expect(result.exists).toBe(true);
			if (result.exists) {
				expect(result.contentType).toBe('text/plain');
				expect(new TextDecoder().decode(result.data)).toBe('Hello, world!');
			}
		});

		test('should return not found for non-existent object', async () => {
			const { adapter, calls } = createMockAdapter([{ ok: false, status: 404 }]);

			const service = new ObjectStorageService(baseUrl, adapter);
			const result = await service.get('test-bucket', 'missing-key');

			expect(calls).toHaveLength(1);
			expect(result.exists).toBe(false);
		});

		test('should use default content type when not provided', async () => {
			const testData = new Uint8Array([1, 2, 3]);
			const { adapter } = createMockAdapter([
				{
					ok: true,
					data: testData.buffer,
					headers: {},
				},
			]);

			const service = new ObjectStorageService(baseUrl, adapter);
			const result = await service.get('test-bucket', 'test-key');

			expect(result.exists).toBe(true);
			if (result.exists) {
				expect(result.contentType).toBe('application/octet-stream');
			}
		});

		test('should validate bucket parameter', async () => {
			const { adapter } = createMockAdapter([]);
			const service = new ObjectStorageService(baseUrl, adapter);

			await expect(service.get('', 'test-key')).rejects.toThrow(
				'bucket is required and cannot be empty'
			);
		});

		test('should validate key parameter', async () => {
			const { adapter } = createMockAdapter([]);
			const service = new ObjectStorageService(baseUrl, adapter);

			await expect(service.get('test-bucket', '')).rejects.toThrow(
				'key is required and cannot be empty'
			);
		});

		test('should handle URL encoding for bucket and key', async () => {
			const { adapter, calls } = createMockAdapter([
				{
					ok: true,
					data: new ArrayBuffer(0),
					headers: {},
				},
			]);

			const service = new ObjectStorageService(baseUrl, adapter);
			await service.get('my bucket', 'my/key with spaces');

			expect(calls[0].url).toBe(
				`${baseUrl}/object/2025-03-17/my%20bucket/my%2Fkey%20with%20spaces`
			);
		});

		test('should handle binary data without transformation', async () => {
			// Create binary data that would be corrupted if treated as text
			const binaryData = new Uint8Array([0x00, 0x01, 0x02, 0xff, 0xfe, 0xfd, 0x80, 0x7f]);
			const { adapter } = createMockAdapter([
				{
					ok: true,
					data: binaryData.buffer,
					headers: { 'content-type': 'application/octet-stream' },
				},
			]);

			const service = new ObjectStorageService(baseUrl, adapter);
			const result = await service.get('test-bucket', 'binary-file');

			expect(result.exists).toBe(true);
			if (result.exists) {
				expect(result.data).toBeInstanceOf(Uint8Array);
				expect(result.data.length).toBe(8);
				expect(Array.from(result.data)).toEqual([
					0x00, 0x01, 0x02, 0xff, 0xfe, 0xfd, 0x80, 0x7f,
				]);
			}
		});

		test('should throw error for server errors (5xx status codes)', async () => {
			const { adapter } = createMockAdapter([
				{ ok: false, status: 500, statusText: 'Internal Server Error' },
			]);

			const service = new ObjectStorageService(baseUrl, adapter);

			await expect(service.get('test-bucket', 'test-key')).rejects.toThrow(
				'Failed to get object: Internal Server Error (500)'
			);
		});
	});

	describe('put', () => {
		test('should put an object with Uint8Array data', async () => {
			const { adapter, calls } = createMockAdapter([{ ok: true, data: {} }]);

			const service = new ObjectStorageService(baseUrl, adapter);
			const data = new TextEncoder().encode('Test content');

			await service.put('test-bucket', 'test-key', data, {
				contentType: 'text/plain',
			});

			expect(calls).toHaveLength(1);
			expect(calls[0].url).toBe(`${baseUrl}/object/2025-03-17/test-bucket/test-key`);
			expect(calls[0].options.method).toBe('PUT');
			expect(calls[0].options.headers?.['Content-Type']).toBe('text/plain');
			expect(calls[0].options.telemetry?.name).toBe('agentuity.objectstore.put');
		});

		test('should put an object with ArrayBuffer data', async () => {
			const { adapter, calls } = createMockAdapter([{ ok: true, data: {} }]);

			const service = new ObjectStorageService(baseUrl, adapter);
			const data = new TextEncoder().encode('Test content').buffer;

			await service.put('test-bucket', 'test-key', data);

			expect(calls).toHaveLength(1);
			expect(calls[0].options.method).toBe('PUT');
		});

		test('should use default content type when not provided', async () => {
			const { adapter, calls } = createMockAdapter([{ ok: true, data: {} }]);

			const service = new ObjectStorageService(baseUrl, adapter);
			const data = new Uint8Array([1, 2, 3]);

			await service.put('test-bucket', 'test-key', data);

			expect(calls[0].options.headers?.['Content-Type']).toBe('application/octet-stream');
		});

		test('should include optional headers', async () => {
			const { adapter, calls } = createMockAdapter([{ ok: true, data: {} }]);

			const service = new ObjectStorageService(baseUrl, adapter);
			const data = new Uint8Array([1, 2, 3]);

			await service.put('test-bucket', 'test-key', data, {
				contentType: 'image/png',
				contentEncoding: 'gzip',
				cacheControl: 'max-age=3600',
				contentDisposition: 'attachment; filename="test.png"',
				contentLanguage: 'en-US',
			});

			expect(calls[0].options.headers?.['Content-Type']).toBe('image/png');
			expect(calls[0].options.headers?.['Content-Encoding']).toBe('gzip');
			expect(calls[0].options.headers?.['Cache-Control']).toBe('max-age=3600');
			expect(calls[0].options.headers?.['Content-Disposition']).toBe(
				'attachment; filename="test.png"'
			);
			expect(calls[0].options.headers?.['Content-Language']).toBe('en-US');
		});

		test('should include metadata headers', async () => {
			const { adapter, calls } = createMockAdapter([{ ok: true, data: {} }]);

			const service = new ObjectStorageService(baseUrl, adapter);
			const data = new Uint8Array([1, 2, 3]);

			await service.put('test-bucket', 'test-key', data, {
				metadata: {
					author: 'user123',
					version: '1.0',
				},
			});

			expect(calls[0].options.headers?.['x-metadata-author']).toBe('user123');
			expect(calls[0].options.headers?.['x-metadata-version']).toBe('1.0');
		});

		test('should validate bucket parameter', async () => {
			const { adapter } = createMockAdapter([]);
			const service = new ObjectStorageService(baseUrl, adapter);
			const data = new Uint8Array([1, 2, 3]);

			await expect(service.put('', 'test-key', data)).rejects.toThrow(
				'bucket is required and cannot be empty'
			);
		});

		test('should validate key parameter', async () => {
			const { adapter } = createMockAdapter([]);
			const service = new ObjectStorageService(baseUrl, adapter);
			const data = new Uint8Array([1, 2, 3]);

			await expect(service.put('test-bucket', '', data)).rejects.toThrow(
				'key is required and cannot be empty'
			);
		});

		test('should validate data parameter', async () => {
			const { adapter } = createMockAdapter([]);
			const service = new ObjectStorageService(baseUrl, adapter);

			await expect(
				service.put('test-bucket', 'test-key', null as unknown as Uint8Array)
			).rejects.toThrow('data is required');
		});

		test('should handle binary data in put operations', async () => {
			const { adapter, calls } = createMockAdapter([{ ok: true, data: {} }]);

			const service = new ObjectStorageService(baseUrl, adapter);
			// Binary data with null bytes and high bytes that would be corrupted if treated as UTF-8
			const binaryData = new Uint8Array([0x00, 0x01, 0x02, 0xff, 0xfe, 0xfd, 0x80, 0x7f]);

			await service.put('test-bucket', 'binary-file', binaryData, {
				contentType: 'application/octet-stream',
			});

			expect(calls).toHaveLength(1);
			expect(calls[0].options.method).toBe('PUT');
			expect(calls[0].options.headers?.['Content-Type']).toBe('application/octet-stream');
			// Verify the body is an ArrayBuffer (converted from Uint8Array)
			expect(calls[0].options.body).toBeInstanceOf(ArrayBuffer);
		});

		test('should throw error for client errors (4xx status codes)', async () => {
			const { adapter } = createMockAdapter([
				{ ok: false, status: 400, statusText: 'Bad Request' },
			]);

			const service = new ObjectStorageService(baseUrl, adapter);
			const data = new Uint8Array([1, 2, 3]);

			await expect(service.put('test-bucket', 'test-key', data)).rejects.toThrow(
				'Failed to put object: Bad Request (400)'
			);
		});
	});

	describe('delete', () => {
		test('should delete an object successfully', async () => {
			const { adapter, calls } = createMockAdapter([{ ok: true, status: 200 }]);

			const service = new ObjectStorageService(baseUrl, adapter);
			const result = await service.delete('test-bucket', 'test-key');

			expect(calls).toHaveLength(1);
			expect(calls[0].url).toBe(`${baseUrl}/object/2025-03-17/test-bucket/test-key`);
			expect(calls[0].options.method).toBe('DELETE');
			expect(calls[0].options.telemetry?.name).toBe('agentuity.objectstore.delete');
			expect(result).toBe(true);
		});

		test('should return false for non-existent object', async () => {
			const { adapter, calls } = createMockAdapter([{ ok: false, status: 404 }]);

			const service = new ObjectStorageService(baseUrl, adapter);
			const result = await service.delete('test-bucket', 'missing-key');

			expect(calls).toHaveLength(1);
			expect(result).toBe(false);
		});

		test('should validate bucket parameter', async () => {
			const { adapter } = createMockAdapter([]);
			const service = new ObjectStorageService(baseUrl, adapter);

			await expect(service.delete('', 'test-key')).rejects.toThrow(
				'bucket is required and cannot be empty'
			);
		});

		test('should validate key parameter', async () => {
			const { adapter } = createMockAdapter([]);
			const service = new ObjectStorageService(baseUrl, adapter);

			await expect(service.delete('test-bucket', '')).rejects.toThrow(
				'key is required and cannot be empty'
			);
		});

		test('should throw error for access denied (403 status code)', async () => {
			const { adapter } = createMockAdapter([
				{ ok: false, status: 403, statusText: 'Forbidden' },
			]);

			const service = new ObjectStorageService(baseUrl, adapter);

			await expect(service.delete('test-bucket', 'test-key')).rejects.toThrow(
				'Failed to delete object: Forbidden (403)'
			);
		});
	});

	describe('createPublicURL', () => {
		test('should create a public URL successfully', async () => {
			const { adapter, calls } = createMockAdapter([
				{
					ok: true,
					data: {
						success: true,
						url: 'https://cdn.example.com/signed-url',
					},
				},
			]);

			const service = new ObjectStorageService(baseUrl, adapter);
			const url = await service.createPublicURL('test-bucket', 'test-key');

			expect(calls).toHaveLength(1);
			expect(calls[0].url).toBe(`${baseUrl}/object/2025-03-17/presigned/test-bucket/test-key`);
			expect(calls[0].options.method).toBe('POST');
			expect(calls[0].options.contentType).toBe('application/json');
			expect(calls[0].options.telemetry?.name).toBe('agentuity.objectstore.createPublicURL');
			expect(url).toBe('https://cdn.example.com/signed-url');
		});

		test('should create a public URL with expiration', async () => {
			const { adapter, calls } = createMockAdapter([
				{
					ok: true,
					data: {
						success: true,
						url: 'https://cdn.example.com/signed-url',
					},
				},
			]);

			const service = new ObjectStorageService(baseUrl, adapter);
			const url = await service.createPublicURL('test-bucket', 'test-key', {
				expiresDuration: 3600000,
			});

			expect(calls).toHaveLength(1);
			expect(JSON.parse(calls[0].options.body as string)).toEqual({ expires: 3600000 });
			expect(url).toBe('https://cdn.example.com/signed-url');
		});

		test('should handle error response with message', async () => {
			const { adapter } = createMockAdapter([
				{
					ok: true,
					data: {
						success: false,
						message: 'Object not found',
					},
				},
			]);

			const service = new ObjectStorageService(baseUrl, adapter);

			await expect(service.createPublicURL('test-bucket', 'test-key')).rejects.toThrow(
				'Object not found'
			);
		});

		test('should validate bucket parameter', async () => {
			const { adapter } = createMockAdapter([]);
			const service = new ObjectStorageService(baseUrl, adapter);

			await expect(service.createPublicURL('', 'test-key')).rejects.toThrow(
				'bucket is required and cannot be empty'
			);
		});

		test('should validate key parameter', async () => {
			const { adapter } = createMockAdapter([]);
			const service = new ObjectStorageService(baseUrl, adapter);

			await expect(service.createPublicURL('test-bucket', '')).rejects.toThrow(
				'key is required and cannot be empty'
			);
		});

		test('should send empty JSON body when no expires duration provided', async () => {
			const { adapter, calls } = createMockAdapter([
				{
					ok: true,
					data: {
						success: true,
						url: 'https://cdn.example.com/signed-url',
					},
				},
			]);

			const service = new ObjectStorageService(baseUrl, adapter);
			const url = await service.createPublicURL('test-bucket', 'test-key');

			expect(calls).toHaveLength(1);
			expect(calls[0].options.body).toBe('{}');
			expect(url).toBe('https://cdn.example.com/signed-url');
		});
	});
});
