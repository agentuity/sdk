import { describe, test, expect } from 'bun:test';
import { StreamStorageService } from '../src/services/stream';
import { createMockAdapter } from './mock-adapter';
import { ServiceException } from '../src/services/exception';

describe('StreamStorageService', () => {
	const baseUrl = 'https://api.example.com/stream';

	describe('create', () => {
		test('should create a stream with valid name', async () => {
			const { adapter, calls } = createMockAdapter([
				{ ok: true, data: { id: 'stream-123' } },
				{ ok: true },
			]);

			const service = new StreamStorageService(baseUrl, adapter);
			const stream = await service.create('test-stream');

			expect(stream).toBeDefined();
			expect(stream.id).toBe('stream-123');
			expect(stream.url).toBe(`${baseUrl}/stream-123`);
			expect(stream.bytesWritten).toBe(0);
			expect(stream.compressed).toBe(false);
			expect(calls[0].url).toBe(baseUrl);
			expect(calls[0].options?.method).toBe('POST');
			expect(calls[0].options?.contentType).toBe('application/json');

			const body = JSON.parse(calls[0].options?.body as string);
			expect(body.name).toBe('test-stream');
			expect(body.contentType).toBe('application/octet-stream');
		});

		test('should create a stream with metadata', async () => {
			const { adapter, calls } = createMockAdapter([
				{ ok: true, data: { id: 'stream-456' } },
				{ ok: true },
			]);

			const service = new StreamStorageService(baseUrl, adapter);
			const metadata = { userId: '123', type: 'video' };
			const stream = await service.create('test-stream', { metadata });

			expect(stream.id).toBe('stream-456');
			const body = JSON.parse(calls[0].options?.body as string);
			expect(body.metadata).toEqual(metadata);
		});

		test('should create a stream with custom contentType', async () => {
			const { adapter, calls } = createMockAdapter([
				{ ok: true, data: { id: 'stream-789' } },
				{ ok: true },
			]);

			const service = new StreamStorageService(baseUrl, adapter);
			const stream = await service.create('test-stream', { contentType: 'application/json' });

			expect(stream.id).toBe('stream-789');
			const body = JSON.parse(calls[0].options?.body as string);
			expect(body.contentType).toBe('application/json');
		});

		test('should create a compressed stream', async () => {
			const { adapter } = createMockAdapter([
				{ ok: true, data: { id: 'stream-compressed' } },
				{ ok: true },
			]);

			const service = new StreamStorageService(baseUrl, adapter);
			const stream = await service.create('test-stream', { compress: true });

			expect(stream.compressed).toBe(true);
		});

		test('should throw error for empty stream name', async () => {
			const { adapter } = createMockAdapter([]);

			const service = new StreamStorageService(baseUrl, adapter);

			await expect(service.create('')).rejects.toThrow(
				'Stream name must be between 1 and 254 characters'
			);
		});

		test('should throw error for stream name too long', async () => {
			const { adapter } = createMockAdapter([]);

			const service = new StreamStorageService(baseUrl, adapter);
			const longName = 'a'.repeat(255);

			await expect(service.create(longName)).rejects.toThrow(
				'Stream name must be between 1 and 254 characters'
			);
		});

		test('should throw ServiceException on error response', async () => {
			const { adapter } = createMockAdapter([
				{ ok: false, status: 500, body: { error: 'Internal Server Error' } },
			]);

			const service = new StreamStorageService(baseUrl, adapter);

			await expect(service.create('test-stream')).rejects.toBeInstanceOf(ServiceException);
		});

		test('should set timeout signal', async () => {
			const { adapter, calls } = createMockAdapter([
				{ ok: true, data: { id: 'stream-123' } },
				{ ok: true },
			]);

			const service = new StreamStorageService(baseUrl, adapter);
			await service.create('test-stream');

			expect(calls[0].options?.signal).toBeDefined();
		});
	});

	describe('list', () => {
		test('should list streams without filters', async () => {
			const mockResponse = {
				success: true,
				streams: [
					{
						id: 'stream-1',
						name: 'stream-one',
						metadata: {},
						url: 'https://example.com/stream-1',
						sizeBytes: 1024,
					},
				],
				total: 1,
			};
			const { adapter, calls } = createMockAdapter([{ ok: true, data: mockResponse }]);

			const service = new StreamStorageService(baseUrl, adapter);
			const result = await service.list();

			expect(result.success).toBe(true);
			expect(result.streams).toHaveLength(1);
			expect(result.total).toBe(1);
			expect(calls).toHaveLength(1);
			expect(calls[0].url).toBe(`${baseUrl}/list`);
			expect(calls[0].options?.method).toBe('POST');
		});

		test('should list streams with name filter', async () => {
			const mockResponse = { success: true, streams: [], total: 0 };
			const { adapter, calls } = createMockAdapter([{ ok: true, data: mockResponse }]);

			const service = new StreamStorageService(baseUrl, adapter);
			await service.list({ name: 'test-stream' });

			const body = JSON.parse(calls[0].options?.body as string);
			expect(body.name).toBe('test-stream');
		});

		test('should list streams with metadata filter', async () => {
			const mockResponse = { success: true, streams: [], total: 0 };
			const { adapter, calls } = createMockAdapter([{ ok: true, data: mockResponse }]);

			const service = new StreamStorageService(baseUrl, adapter);
			const metadata = { type: 'video' };
			await service.list({ metadata });

			const body = JSON.parse(calls[0].options?.body as string);
			expect(body.metadata).toEqual(metadata);
		});

		test('should list streams with limit', async () => {
			const mockResponse = { success: true, streams: [], total: 0 };
			const { adapter, calls } = createMockAdapter([{ ok: true, data: mockResponse }]);

			const service = new StreamStorageService(baseUrl, adapter);
			await service.list({ limit: 50 });

			const body = JSON.parse(calls[0].options?.body as string);
			expect(body.limit).toBe(50);
		});

		test('should list streams with offset', async () => {
			const mockResponse = { success: true, streams: [], total: 0 };
			const { adapter, calls } = createMockAdapter([{ ok: true, data: mockResponse }]);

			const service = new StreamStorageService(baseUrl, adapter);
			await service.list({ offset: 100 });

			const body = JSON.parse(calls[0].options?.body as string);
			expect(body.offset).toBe(100);
		});

		test('should throw error for invalid limit (zero)', async () => {
			const { adapter } = createMockAdapter([]);

			const service = new StreamStorageService(baseUrl, adapter);

			await expect(service.list({ limit: 0 })).rejects.toThrow(
				'limit must be greater than 0 and less than or equal to 1000'
			);
		});

		test('should throw error for invalid limit (too high)', async () => {
			const { adapter } = createMockAdapter([]);

			const service = new StreamStorageService(baseUrl, adapter);

			await expect(service.list({ limit: 1001 })).rejects.toThrow(
				'limit must be greater than 0 and less than or equal to 1000'
			);
		});

		test('should throw ServiceException on error response', async () => {
			const { adapter } = createMockAdapter([
				{ ok: false, status: 500, body: { error: 'Internal Server Error' } },
			]);

			const service = new StreamStorageService(baseUrl, adapter);

			await expect(service.list()).rejects.toBeInstanceOf(ServiceException);
		});

		test('should set timeout signal', async () => {
			const mockResponse = { success: true, streams: [], total: 0 };
			const { adapter, calls } = createMockAdapter([{ ok: true, data: mockResponse }]);

			const service = new StreamStorageService(baseUrl, adapter);
			await service.list();

			expect(calls[0].options?.signal).toBeDefined();
		});
	});

	describe('delete', () => {
		test('should delete stream by id', async () => {
			const { adapter, calls } = createMockAdapter([{ ok: true }]);

			const service = new StreamStorageService(baseUrl, adapter);
			await service.delete('stream-123');

			expect(calls).toHaveLength(1);
			expect(calls[0].url).toBe(`${baseUrl}/stream-123`);
			expect(calls[0].options?.method).toBe('DELETE');
		});

		test('should throw error for empty id', async () => {
			const { adapter } = createMockAdapter([]);

			const service = new StreamStorageService(baseUrl, adapter);

			await expect(service.delete('')).rejects.toThrow(
				'Stream id is required and must be a non-empty string'
			);
		});

		test('should throw error for whitespace id', async () => {
			const { adapter } = createMockAdapter([]);

			const service = new StreamStorageService(baseUrl, adapter);

			await expect(service.delete('   ')).rejects.toThrow(
				'Stream id is required and must be a non-empty string'
			);
		});

		test('should throw ServiceException on error response', async () => {
			const { adapter } = createMockAdapter([
				{ ok: false, status: 404, body: { error: 'Not Found' } },
			]);

			const service = new StreamStorageService(baseUrl, adapter);

			await expect(service.delete('nonexistent-stream')).rejects.toBeInstanceOf(
				ServiceException
			);
		});

		test('should set timeout signal', async () => {
			const { adapter, calls } = createMockAdapter([{ ok: true }]);

			const service = new StreamStorageService(baseUrl, adapter);
			await service.delete('stream-123');

			expect(calls[0].options?.signal).toBeDefined();
		});
	});

	describe('Stream operations', () => {
		test('should write string data to stream', async () => {
			const { adapter } = createMockAdapter([
				{ ok: true, data: { id: 'stream-write' } },
				{ ok: true },
			]);

			const service = new StreamStorageService(baseUrl, adapter);
			const stream = await service.create('test-stream');

			const writePromise = stream.write('hello world');
			const closePromise = stream.close();

			await Promise.all([writePromise, closePromise]);

			expect(stream.bytesWritten).toBeGreaterThan(0);
		});

		test('should write object data to stream', async () => {
			const { adapter } = createMockAdapter([
				{ ok: true, data: { id: 'stream-write' } },
				{ ok: true },
			]);

			const service = new StreamStorageService(baseUrl, adapter);
			const stream = await service.create('test-stream');

			const writePromise = stream.write({ foo: 'bar', num: 42 });
			const closePromise = stream.close();

			await Promise.all([writePromise, closePromise]);

			expect(stream.bytesWritten).toBeGreaterThan(0);
		});

		test('should write Uint8Array data to stream', async () => {
			const { adapter } = createMockAdapter([
				{ ok: true, data: { id: 'stream-write' } },
				{ ok: true },
			]);

			const service = new StreamStorageService(baseUrl, adapter);
			const stream = await service.create('test-stream');

			const data = new Uint8Array([1, 2, 3, 4, 5]);
			const writePromise = stream.write(data);
			const closePromise = stream.close();

			await Promise.all([writePromise, closePromise]);

			expect(stream.bytesWritten).toBe(5);
		});

		test('should write ArrayBuffer data to stream', async () => {
			const { adapter } = createMockAdapter([
				{ ok: true, data: { id: 'stream-write' } },
				{ ok: true },
			]);

			const service = new StreamStorageService(baseUrl, adapter);
			const stream = await service.create('test-stream');

			const buffer = new ArrayBuffer(10);
			const writePromise = stream.write(buffer);
			const closePromise = stream.close();

			await Promise.all([writePromise, closePromise]);

			expect(stream.bytesWritten).toBe(10);
		});

		test('should handle close on already closed stream', async () => {
			const { adapter } = createMockAdapter([
				{ ok: true, data: { id: 'stream-close' } },
				{ ok: true },
			]);

			const service = new StreamStorageService(baseUrl, adapter);
			const stream = await service.create('test-stream');

			await stream.close();
			await stream.close();
		});

		test('should track bytesWritten correctly', async () => {
			const { adapter } = createMockAdapter([
				{ ok: true, data: { id: 'stream-bytes' } },
				{ ok: true },
			]);

			const service = new StreamStorageService(baseUrl, adapter);
			const stream = await service.create('test-stream');

			expect(stream.bytesWritten).toBe(0);

			const write1 = stream.write('hello');
			await write1;
			const bytes1 = stream.bytesWritten;
			expect(bytes1).toBeGreaterThan(0);

			const write2 = stream.write(' world');
			const closePromise = stream.close();

			await Promise.all([write2, closePromise]);
			const bytes2 = stream.bytesWritten;
			expect(bytes2).toBeGreaterThan(bytes1);
		});
	});

	describe('onBefore hook', () => {
		test('should call onBefore for create operation', async () => {
			let postCallMade = false;
			const { adapter } = createMockAdapter(
				[{ ok: true, data: { id: 'stream-before' } }, { ok: true }],
				{
					onBefore: async (url, options, invoke) => {
						if (options.method === 'POST' && url === baseUrl) {
							postCallMade = true;
						}
						await invoke();
					},
				}
			);

			const service = new StreamStorageService(baseUrl, adapter);
			await service.create('test-stream');

			expect(postCallMade).toBe(true);
		});

		test('should call onBefore for list operation', async () => {
			let beforeCalled = false;
			const mockResponse = { success: true, streams: [], total: 0 };
			const { adapter } = createMockAdapter([{ ok: true, data: mockResponse }], {
				onBefore: async (url, options, invoke) => {
					beforeCalled = true;
					expect(url).toBe(`${baseUrl}/list`);
					expect(options.method).toBe('POST');
					await invoke();
				},
			});

			const service = new StreamStorageService(baseUrl, adapter);
			await service.list();

			expect(beforeCalled).toBe(true);
		});

		test('should call onBefore for delete operation', async () => {
			let beforeCalled = false;
			const { adapter } = createMockAdapter([{ ok: true }], {
				onBefore: async (url, options, invoke) => {
					beforeCalled = true;
					expect(url).toBe(`${baseUrl}/stream-123`);
					expect(options.method).toBe('DELETE');
					await invoke();
				},
			});

			const service = new StreamStorageService(baseUrl, adapter);
			await service.delete('stream-123');

			expect(beforeCalled).toBe(true);
		});
	});

	describe('onAfter hook', () => {
		test('should call onAfter on successful create', async () => {
			let afterCalled = false;
			const { adapter } = createMockAdapter(
				[{ ok: true, data: { id: 'stream-after' } }, { ok: true }],
				{
					onAfter: async (response) => {
						afterCalled = true;
						expect(response.status).toBe(200);
					},
				}
			);

			const service = new StreamStorageService(baseUrl, adapter);
			await service.create('test-stream');

			expect(afterCalled).toBe(true);
		});

		test('should call onAfter on successful list', async () => {
			let afterCalled = false;
			const mockResponse = { success: true, streams: [], total: 0 };
			const { adapter } = createMockAdapter([{ ok: true, data: mockResponse }], {
				onAfter: async (response) => {
					afterCalled = true;
					expect(response.status).toBe(200);
				},
			});

			const service = new StreamStorageService(baseUrl, adapter);
			await service.list();

			expect(afterCalled).toBe(true);
		});

		test('should call onAfter on error response', async () => {
			let afterCalled = false;
			const { adapter } = createMockAdapter(
				[{ ok: false, status: 500, body: { error: 'Internal Server Error' } }],
				{
					onAfter: async (response, error) => {
						afterCalled = true;
						expect(response.status).toBe(500);
						expect(error).toBeDefined();
					},
				}
			);

			const service = new StreamStorageService(baseUrl, adapter);

			try {
				await service.create('test-stream');
			} catch {
				// Expected to throw
			}

			expect(afterCalled).toBe(true);
		});
	});

	describe('get', () => {
		test('should get stream info by id', async () => {
			const mockResponse = {
				id: 'stream-123',
				name: 'test-stream',
				metadata: { type: 'video' },
				url: 'https://example.com/stream-123',
				size_bytes: 2048,
			};
			const { adapter, calls } = createMockAdapter([{ ok: true, data: mockResponse }]);

			const service = new StreamStorageService(baseUrl, adapter);
			const result = await service.get('stream-123');

			expect(result.id).toBe('stream-123');
			expect(result.name).toBe('test-stream');
			expect(result.metadata).toEqual({ type: 'video' });
			expect(result.sizeBytes).toBe(2048);
			expect(calls[0].url).toBe(`${baseUrl}/stream-123/info`);
			expect(calls[0].options?.method).toBe('POST');
		});

		test('should throw error for empty id', async () => {
			const { adapter } = createMockAdapter([]);

			const service = new StreamStorageService(baseUrl, adapter);

			await expect(service.get('')).rejects.toThrow(
				'Stream id is required and must be a non-empty string'
			);
		});

		test('should throw ServiceException on error response', async () => {
			const { adapter } = createMockAdapter([
				{ ok: false, status: 404, body: { error: 'Not Found' } },
			]);

			const service = new StreamStorageService(baseUrl, adapter);

			await expect(service.get('nonexistent-stream')).rejects.toBeInstanceOf(ServiceException);
		});
	});

	describe('download', () => {
		test('should download stream content as ReadableStream', async () => {
			const testData = new TextEncoder().encode('hello world');
			const mockResponse = {
				ok: true,
				data: undefined,
				headers: { 'content-type': 'application/octet-stream' },
			};

			const { adapter, calls } = createMockAdapter([mockResponse]);

			// Override the response to have a proper body
			const originalInvoke = adapter.invoke;
			adapter.invoke = async <T>(
				url: string,
				options: import('../src/services/adapter').FetchRequest
			) => {
				const result = await originalInvoke<T>(url, options);
				if (options.method === 'GET' && url.includes('stream-123')) {
					const stream = new ReadableStream({
						start(controller) {
							controller.enqueue(testData);
							controller.close();
						},
					});
					return {
						ok: true as const,
						data: undefined as never,
						response: new Response(stream, { status: 200 }),
					};
				}
				return result;
			};

			const service = new StreamStorageService(baseUrl, adapter);
			const readable = await service.download('stream-123');

			expect(readable).toBeInstanceOf(ReadableStream);

			// Read the stream content
			const reader = readable.getReader();
			const { value, done } = await reader.read();
			expect(done).toBe(false);
			expect(value).toEqual(testData);

			const { done: done2 } = await reader.read();
			expect(done2).toBe(true);

			expect(calls[0].url).toBe(`${baseUrl}/stream-123`);
			expect(calls[0].options?.method).toBe('GET');
		});

		test('should throw error for empty id', async () => {
			const { adapter } = createMockAdapter([]);

			const service = new StreamStorageService(baseUrl, adapter);

			await expect(service.download('')).rejects.toThrow(
				'Stream id is required and must be a non-empty string'
			);
		});
	});

	describe('compression with server-side compression', () => {
		test('should write compressed data using CompressionStream', async () => {
			const { adapter, calls } = createMockAdapter([
				{ ok: true, data: { id: 'stream-compressed' } },
				{ ok: true }, // append
				{ ok: true }, // complete
			]);

			const service = new StreamStorageService(baseUrl, adapter);
			const stream = await service.create('test-stream', { compress: true });

			expect(stream.compressed).toBe(true);

			await stream.write('hello world');
			await stream.close();

			// Verify the complete request has X-Compress: gzip header (server-side compression)
			const completeCall = calls.find((c) => c.url?.includes('/complete'));
			expect(completeCall).toBeDefined();
			expect(completeCall?.options?.headers?.['X-Compress']).toBe('gzip');
		});

		test('should produce valid gzip compressed output', async () => {
			const { adapter, calls } = createMockAdapter([
				{ ok: true, data: { id: 'stream-gzip-test' } },
				{ ok: true }, // append
				{ ok: true }, // complete
			]);

			const service = new StreamStorageService(baseUrl, adapter);
			const stream = await service.create('test-stream', { compress: true });

			const testData = 'Hello, this is test data for compression!';
			await stream.write(testData);
			await stream.close();

			// Verify append was called with the uncompressed data
			const appendCall = calls.find((c) => c.url?.includes('/append'));
			expect(appendCall).toBeDefined();
			expect(appendCall?.options?.method).toBe('POST');

			// Verify complete was called with compression header
			const completeCall = calls.find((c) => c.url?.includes('/complete'));
			expect(completeCall).toBeDefined();
			expect(completeCall?.options?.headers?.['X-Compress']).toBe('gzip');
		});
	});

	describe('getReader', () => {
		test('should return a ReadableStream from getReader()', async () => {
			const testData = new TextEncoder().encode('streamed content');
			const { adapter } = createMockAdapter([
				{ ok: true, data: { id: 'stream-reader' } },
				{ ok: true },
			]);

			// Override invoke for GET request to stream URL
			const originalInvoke = adapter.invoke;
			adapter.invoke = async <T>(
				url: string,
				options: import('../src/services/adapter').FetchRequest
			) => {
				if (options.method === 'GET' && url.includes('stream-reader')) {
					const stream = new ReadableStream({
						start(controller) {
							controller.enqueue(testData);
							controller.close();
						},
					});
					return {
						ok: true as const,
						data: undefined as never,
						response: new Response(stream, { status: 200 }),
					};
				}
				return originalInvoke<T>(url, options);
			};

			const service = new StreamStorageService(baseUrl, adapter);
			const stream = await service.create('test-stream');

			const readable = stream.getReader();

			expect(readable).toBeInstanceOf(ReadableStream);

			// Read the content
			const reader = readable.getReader();
			const { value } = await reader.read();
			expect(value).toEqual(testData);
		});

		test('should handle errors in getReader stream', async () => {
			const { adapter } = createMockAdapter([
				{ ok: true, data: { id: 'stream-error' } },
				{ ok: true },
			]);

			// Override invoke to return error for GET
			const originalInvoke = adapter.invoke;
			adapter.invoke = async <T>(
				url: string,
				options: import('../src/services/adapter').FetchRequest
			) => {
				if (options.method === 'GET' && url.includes('stream-error')) {
					return {
						ok: false as const,
						data: undefined as never,
						response: new Response(null, {
							status: 500,
							statusText: 'Internal Server Error',
						}),
					};
				}
				return originalInvoke<T>(url, options);
			};

			const service = new StreamStorageService(baseUrl, adapter);
			const stream = await service.create('test-stream');

			const readable = stream.getReader();
			const reader = readable.getReader();

			await expect(reader.read()).rejects.toThrow();
		});

		test('should support cancellation in getReader', async () => {
			let abortCalled = false;
			const { adapter } = createMockAdapter([
				{ ok: true, data: { id: 'stream-cancel' } },
				{ ok: true },
			]);

			// Override invoke to track abort
			const originalInvoke = adapter.invoke;
			adapter.invoke = async <T>(
				url: string,
				options: import('../src/services/adapter').FetchRequest
			) => {
				if (options.method === 'GET' && url.includes('stream-cancel')) {
					if (options.signal) {
						options.signal.addEventListener('abort', () => {
							abortCalled = true;
						});
					}
					// Return a stream that never completes
					const stream = new ReadableStream({
						start() {
							// Don't close - simulates long-running stream
						},
					});
					return {
						ok: true as const,
						data: undefined as never,
						response: new Response(stream, { status: 200 }),
					};
				}
				return originalInvoke<T>(url, options);
			};

			const service = new StreamStorageService(baseUrl, adapter);
			const stream = await service.create('test-stream');

			const readable = stream.getReader();
			await readable.cancel('test cancellation');

			expect(abortCalled).toBe(true);
		});
	});

	describe('telemetry attributes', () => {
		test('should include telemetry for create operation', async () => {
			const { adapter, calls } = createMockAdapter([
				{ ok: true, data: { id: 'stream-123' } },
				{ ok: true },
			]);

			const service = new StreamStorageService(baseUrl, adapter);
			await service.create('test-stream', {
				metadata: { userId: '123' },
				contentType: 'application/json',
			});

			expect(calls[0].options?.telemetry).toBeDefined();
			expect(calls[0].options?.telemetry?.name).toBe('agentuity.stream.create');
			expect(calls[0].options?.telemetry?.attributes?.name).toBe('test-stream');
		});

		test('should include telemetry for list operation', async () => {
			const mockResponse = { success: true, streams: [], total: 0 };
			const { adapter, calls } = createMockAdapter([{ ok: true, data: mockResponse }]);

			const service = new StreamStorageService(baseUrl, adapter);
			await service.list({ name: 'test', limit: 10 });

			expect(calls[0].options?.telemetry).toBeDefined();
			expect(calls[0].options?.telemetry?.name).toBe('agentuity.stream.list');
			expect(calls[0].options?.telemetry?.attributes?.name).toBe('test');
			expect(calls[0].options?.telemetry?.attributes?.limit).toBe('10');
		});

		test('should include telemetry for delete operation', async () => {
			const { adapter, calls } = createMockAdapter([{ ok: true }]);

			const service = new StreamStorageService(baseUrl, adapter);
			await service.delete('stream-123');

			expect(calls[0].options?.telemetry).toBeDefined();
			expect(calls[0].options?.telemetry?.name).toBe('agentuity.stream.delete');
			expect(calls[0].options?.telemetry?.attributes?.['stream.id']).toBe('stream-123');
		});
	});
});
