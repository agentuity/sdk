import { describe, test, expect } from 'bun:test';
import { VectorStorageService } from '../src/services/vector';
import type { VectorUpsertParams } from '../src/services/vector';
import { createMockAdapter } from './mock-adapter';

describe('VectorStorageService', () => {
	const baseUrl = 'https://api.example.com';

	// ===================================================================
	// 1. INPUT VALIDATION TESTS
	// ===================================================================

	describe('Input Validation - Upsert', () => {
		test('rejects empty storage name', async () => {
			const { adapter } = createMockAdapter([]);
			const service = new VectorStorageService(baseUrl, adapter);

			await expect(service.upsert('', { key: 'k1', document: 'text' })).rejects.toThrow(
				'Vector storage name is required and must be a non-empty string'
			);
		});

		test('rejects whitespace-only storage name', async () => {
			const { adapter } = createMockAdapter([]);
			const service = new VectorStorageService(baseUrl, adapter);

			await expect(service.upsert('   ', { key: 'k1', document: 'text' })).rejects.toThrow(
				'Vector storage name is required and must be a non-empty string'
			);
		});

		test('rejects when no documents provided', async () => {
			const { adapter } = createMockAdapter([]);
			const service = new VectorStorageService(baseUrl, adapter);

			await expect(service.upsert('my-vectors')).rejects.toThrow(
				'Vector storage requires at least one document for this method'
			);
		});

		test('rejects document without key', async () => {
			const { adapter } = createMockAdapter([]);
			const service = new VectorStorageService(baseUrl, adapter);

			await expect(service.upsert('my-vectors', { key: '', document: 'text' })).rejects.toThrow(
				'Vector storage requires each document to have a non-empty key'
			);
		});

		test('rejects document without embeddings or text', async () => {
			const { adapter } = createMockAdapter([]);
			const service = new VectorStorageService(baseUrl, adapter);

			await expect(
				service.upsert('my-vectors', { key: 'k1' } as unknown as VectorUpsertParams)
			).rejects.toThrow(
				'Vector storage requires each document to have either embeddings or document property'
			);
		});

		test('rejects empty embeddings array', async () => {
			const { adapter } = createMockAdapter([]);
			const service = new VectorStorageService(baseUrl, adapter);

			await expect(service.upsert('my-vectors', { key: 'k1', embeddings: [] })).rejects.toThrow(
				'Vector storage requires each embeddings property to have a non-empty array of numbers'
			);
		});

		test('rejects empty document text', async () => {
			const { adapter } = createMockAdapter([]);
			const service = new VectorStorageService(baseUrl, adapter);

			await expect(service.upsert('my-vectors', { key: 'k1', document: '   ' })).rejects.toThrow(
				'Vector storage requires each document property to have a non-empty string value'
			);
		});
	});

	describe('Input Validation - Get', () => {
		test('rejects empty storage name', async () => {
			const { adapter } = createMockAdapter([]);
			const service = new VectorStorageService(baseUrl, adapter);

			await expect(service.get('', 'key1')).rejects.toThrow(
				'Vector storage name is required and must be a non-empty string'
			);
		});

		test('rejects empty key', async () => {
			const { adapter } = createMockAdapter([]);
			const service = new VectorStorageService(baseUrl, adapter);

			await expect(service.get('my-vectors', '')).rejects.toThrow(
				'Vector storage key is required and must be a non-empty string'
			);
		});
	});

	describe('Input Validation - GetMany', () => {
		test('rejects empty storage name', async () => {
			const { adapter } = createMockAdapter([]);
			const service = new VectorStorageService(baseUrl, adapter);

			await expect(service.getMany('', 'key1')).rejects.toThrow(
				'Vector storage name is required and must be a non-empty string'
			);
		});

		test('returns empty map when no keys provided', async () => {
			const { adapter, calls } = createMockAdapter([]);
			const service = new VectorStorageService(baseUrl, adapter);

			const result = await service.getMany('my-vectors');
			expect(result.size).toBe(0);
			expect(calls).toHaveLength(0);
		});

		test('rejects empty key in array', async () => {
			const { adapter } = createMockAdapter([]);
			const service = new VectorStorageService(baseUrl, adapter);

			await expect(service.getMany('my-vectors', 'key1', '', 'key3')).rejects.toThrow(
				'Vector storage requires all keys to be non-empty strings'
			);
		});
	});

	describe('Input Validation - Search', () => {
		test('rejects empty storage name', async () => {
			const { adapter } = createMockAdapter([]);
			const service = new VectorStorageService(baseUrl, adapter);

			await expect(service.search('', { query: 'test query' })).rejects.toThrow(
				'Vector storage name is required and must be a non-empty string'
			);
		});

		test('rejects empty query', async () => {
			const { adapter } = createMockAdapter([]);
			const service = new VectorStorageService(baseUrl, adapter);

			await expect(service.search('my-vectors', { query: '' })).rejects.toThrow(
				'Vector storage query property is required and must be a non-empty string'
			);
		});

		test('rejects negative limit', async () => {
			const { adapter } = createMockAdapter([]);
			const service = new VectorStorageService(baseUrl, adapter);

			await expect(service.search('my-vectors', { query: 'test', limit: -5 })).rejects.toThrow(
				'Vector storage limit property must be positive number'
			);
		});

		test('rejects zero limit', async () => {
			const { adapter } = createMockAdapter([]);
			const service = new VectorStorageService(baseUrl, adapter);

			await expect(service.search('my-vectors', { query: 'test', limit: 0 })).rejects.toThrow(
				'Vector storage limit property must be positive number'
			);
		});

		test('rejects similarity < 0', async () => {
			const { adapter } = createMockAdapter([]);
			const service = new VectorStorageService(baseUrl, adapter);

			await expect(
				service.search('my-vectors', { query: 'test', similarity: -0.1 })
			).rejects.toThrow(
				'Vector storage similarity property must be a number between 0.0 and 1.0'
			);
		});

		test('rejects similarity > 1', async () => {
			const { adapter } = createMockAdapter([]);
			const service = new VectorStorageService(baseUrl, adapter);

			await expect(
				service.search('my-vectors', { query: 'test', similarity: 1.5 })
			).rejects.toThrow(
				'Vector storage similarity property must be a number between 0.0 and 1.0'
			);
		});

		test('rejects invalid metadata', async () => {
			const { adapter } = createMockAdapter([]);
			const service = new VectorStorageService(baseUrl, adapter);

			await expect(
				service.search('my-vectors', {
					query: 'test',
					metadata: null as unknown as Record<string, unknown>,
				})
			).rejects.toThrow('Vector storage metadata property must be a valid object');
		});

		test('accepts boundary similarity values', async () => {
			const { adapter, calls } = createMockAdapter([
				{ ok: true, data: { success: true, data: [] } },
				{ ok: true, data: { success: true, data: [] } },
			]);
			const service = new VectorStorageService(baseUrl, adapter);

			await service.search('my-vectors', { query: 'test', similarity: 0.0 });
			expect(calls).toHaveLength(1);

			await service.search('my-vectors', { query: 'test', similarity: 1.0 });
			expect(calls).toHaveLength(2);
		});
	});

	describe('Input Validation - Delete', () => {
		test('rejects empty storage name', async () => {
			const { adapter } = createMockAdapter([]);
			const service = new VectorStorageService(baseUrl, adapter);

			await expect(service.delete('', 'key1')).rejects.toThrow(
				'Vector storage name is required and must be a non-empty string'
			);
		});

		test('rejects empty key in array', async () => {
			const { adapter } = createMockAdapter([]);
			const service = new VectorStorageService(baseUrl, adapter);

			await expect(service.delete('my-vectors', 'key1', '', 'key3')).rejects.toThrow(
				'Vector storage requires all keys to be non-empty strings'
			);
		});

		test('returns 0 when no keys provided', async () => {
			const { adapter, calls } = createMockAdapter([]);
			const service = new VectorStorageService(baseUrl, adapter);

			const result = await service.delete('my-vectors');
			expect(result).toBe(0);
			expect(calls).toHaveLength(0);
		});
	});

	describe('Input Validation - Exists', () => {
		test('rejects empty storage name', async () => {
			const { adapter } = createMockAdapter([]);
			const service = new VectorStorageService(baseUrl, adapter);

			await expect(service.exists('')).rejects.toThrow(
				'Vector storage name is required and must be a non-empty string'
			);
		});
	});

	// ===================================================================
	// 2. API INTEGRATION TESTS
	// ===================================================================

	describe('Upsert Operation', () => {
		test('successfully upserts with document text', async () => {
			const { adapter, calls } = createMockAdapter([
				{
					ok: true,
					data: { success: true, data: [{ id: 'vec-1' }, { id: 'vec-2' }] },
				},
			]);

			const service = new VectorStorageService(baseUrl, adapter);

			const result = await service.upsert(
				'my-vectors',
				{ key: 'k1', document: 'First document' },
				{ key: 'k2', document: 'Second document' }
			);

			expect(result).toEqual([
				{ key: 'k1', id: 'vec-1' },
				{ key: 'k2', id: 'vec-2' },
			]);
			expect(calls).toHaveLength(1);
			expect(calls[0].url).toBe(`${baseUrl}/vector/2025-03-17/my-vectors`);
			expect(calls[0].options).toMatchObject({
				method: 'PUT',
				contentType: 'application/json',
			});
		});

		test('successfully upserts with embeddings', async () => {
			const { adapter } = createMockAdapter([
				{ ok: true, data: { success: true, data: [{ id: 'vec-1' }] } },
			]);

			const service = new VectorStorageService(baseUrl, adapter);

			const embeddings = [0.1, 0.2, 0.3, 0.4];
			const result = await service.upsert('my-vectors', {
				key: 'k1',
				embeddings,
				metadata: { source: 'test' },
			});

			expect(result).toEqual([{ key: 'k1', id: 'vec-1' }]);
		});

		test('includes telemetry in upsert request', async () => {
			const { adapter, calls } = createMockAdapter([
				{ ok: true, data: { success: true, data: [{ id: 'vec-1' }] } },
			]);

			const service = new VectorStorageService(baseUrl, adapter);
			await service.upsert('my-vectors', { key: 'k1', document: 'test' });

			expect(calls).toHaveLength(1);
			expect(calls[0].options).toMatchObject({
				telemetry: {
					name: 'agentuity.vector.upsert',
					attributes: {
						name: 'my-vectors',
						count: '1',
					},
				},
			});
		});
	});

	describe('Get Operation', () => {
		test('returns vector when found', async () => {
			const { adapter } = createMockAdapter([
				{
					ok: true,
					data: {
						success: true,
						data: {
							id: 'vec-1',
							key: 'k1',
							similarity: 1.0,
							document: 'Test document',
							metadata: { source: 'test' },
						},
					},
				},
			]);

			const service = new VectorStorageService(baseUrl, adapter);
			const result = await service.get('my-vectors', 'k1');

			expect(result.exists).toBe(true);
			if (result.exists) {
				expect(result.data.id).toBe('vec-1');
				expect(result.data.key).toBe('k1');
				expect(result.data.document).toBe('Test document');
			}
		});

		test('returns exists: false when vector not found', async () => {
			const { adapter } = createMockAdapter([{ ok: false, status: 404 }]);

			const service = new VectorStorageService(baseUrl, adapter);
			const result = await service.get('my-vectors', 'non-existent');

			expect(result.exists).toBe(false);
		});

		test('constructs correct URL with encoding', async () => {
			const { adapter, calls } = createMockAdapter([
				{
					ok: true,
					data: { success: true, data: { id: 'vec-1', key: 'k1', similarity: 1.0 } },
				},
			]);

			const service = new VectorStorageService(baseUrl, adapter);
			await service.get('my vectors', 'key/with/slashes');

			expect(calls[0].url).toContain('my%20vectors');
		});
	});

	describe('GetMany Operation', () => {
		test('returns map of found vectors', async () => {
			const { adapter } = createMockAdapter([
				{
					ok: true,
					data: {
						success: true,
						data: { id: 'vec-1', key: 'key1', similarity: 1.0, document: 'Doc 1' },
					},
				},
				{
					ok: true,
					data: {
						success: true,
						data: { id: 'vec-2', key: 'key2', similarity: 1.0, document: 'Doc 2' },
					},
				},
				{ ok: false, status: 404 },
			]);

			const service = new VectorStorageService(baseUrl, adapter);
			const result = await service.getMany('my-vectors', 'key1', 'key2', 'key3');

			expect(result.size).toBe(2);
			expect(result.has('key1')).toBe(true);
			expect(result.has('key2')).toBe(true);
			expect(result.has('key3')).toBe(false);
			expect(result.get('key1')?.id).toBe('vec-1');
			expect(result.get('key2')?.id).toBe('vec-2');
		});

		test('returns empty map when no keys provided', async () => {
			const { adapter, calls } = createMockAdapter([
				{ ok: true, data: { success: true, data: [] } },
			]);

			const service = new VectorStorageService(baseUrl, adapter);
			const result = await service.getMany('my-vectors');

			expect(result.size).toBe(0);
			expect(calls).toHaveLength(0);
		});
	});

	describe('Search Operation', () => {
		test('returns matching vectors', async () => {
			const { adapter } = createMockAdapter([
				{
					ok: true,
					data: {
						success: true,
						data: [
							{ id: 'vec-1', key: 'k1', similarity: 0.95, metadata: { category: 'A' } },
							{ id: 'vec-2', key: 'k2', similarity: 0.87, metadata: { category: 'B' } },
						],
					},
				},
			]);

			const service = new VectorStorageService(baseUrl, adapter);
			const result = await service.search('my-vectors', {
				query: 'test query',
				limit: 10,
				similarity: 0.8,
			});

			expect(result).toHaveLength(2);
			expect(result[0].similarity).toBe(0.95);
			expect(result[1].similarity).toBe(0.87);
		});

		test('returns empty array when storage not found', async () => {
			const { adapter } = createMockAdapter([{ ok: false, status: 404 }]);

			const service = new VectorStorageService(baseUrl, adapter);
			const result = await service.search('non-existent', { query: 'test' });

			expect(result).toEqual([]);
		});

		test('throws on non-404 errors', async () => {
			const { adapter } = createMockAdapter([
				{ ok: false, status: 400, body: { message: 'Bad Request' } },
			]);

			const service = new VectorStorageService(baseUrl, adapter);

			await expect(service.search('my-vectors', { query: 'test' })).rejects.toThrow();
		});

		test('includes metadata filter in request', async () => {
			const { adapter, calls } = createMockAdapter([
				{ ok: true, data: { success: true, data: [] } },
			]);

			const service = new VectorStorageService(baseUrl, adapter);
			await service.search('my-vectors', {
				query: 'test',
				metadata: { category: 'furniture', inStock: true },
			});

			const body = JSON.parse(calls[0].options.body as string);
			expect(body.metadata).toEqual({ category: 'furniture', inStock: true });
		});

		test('includes parameters in telemetry', async () => {
			const { adapter, calls } = createMockAdapter([
				{ ok: true, data: { success: true, data: [] } },
			]);

			const service = new VectorStorageService(baseUrl, adapter);
			await service.search('my-vectors', {
				query: 'search text',
				limit: 5,
				similarity: 0.75,
			});

			expect(calls[0].options).toMatchObject({
				telemetry: {
					name: 'agentuity.vector.search',
					attributes: {
						name: 'my-vectors',
						query: 'search text',
						limit: '5',
						similarity: '0.75',
					},
				},
			});
		});
	});

	describe('Delete Operation', () => {
		test('deletes single key successfully', async () => {
			const { adapter, calls } = createMockAdapter([
				{ ok: true, data: { success: true, data: 1 } },
			]);

			const service = new VectorStorageService(baseUrl, adapter);
			const result = await service.delete('my-vectors', 'k1');

			expect(result).toBe(1);
			expect(calls).toHaveLength(1);
			expect(calls[0].url).toBe(`${baseUrl}/vector/2025-03-17/my-vectors/k1`);
			expect(calls[0].options).toMatchObject({ method: 'DELETE' });
		});

		test('deletes multiple keys successfully', async () => {
			const { adapter, calls } = createMockAdapter([
				{ ok: true, data: { success: true, data: 3 } },
			]);

			const service = new VectorStorageService(baseUrl, adapter);
			const result = await service.delete('my-vectors', 'k1', 'k2', 'k3');

			expect(result).toBe(3);

			expect(calls[0].url).toBe(`${baseUrl}/vector/2025-03-17/my-vectors`);
			const body = JSON.parse(calls[0].options.body as string);
			expect(body.keys).toEqual(['k1', 'k2', 'k3']);
		});

		test('returns 0 without API call when no keys provided', async () => {
			const { adapter, calls } = createMockAdapter([
				{ ok: true, data: { success: true, data: 0 } },
			]);

			const service = new VectorStorageService(baseUrl, adapter);
			const result = await service.delete('my-vectors');

			expect(result).toBe(0);
			expect(calls).toHaveLength(0);
		});

		test('returns 0 when server reports nothing deleted', async () => {
			const { adapter, calls } = createMockAdapter([
				{ ok: true, data: { success: true, data: 0 } },
			]);

			const service = new VectorStorageService(baseUrl, adapter);
			const result = await service.delete('my-vectors', 'non-existent-key');

			expect(result).toBe(0);
			expect(calls.length).toBeGreaterThan(0);
		});

		test('throws error when bulk delete fails', async () => {
			const { adapter } = createMockAdapter([
				{ ok: true, data: { success: false, message: 'Bulk delete failed' } },
			]);

			const service = new VectorStorageService(baseUrl, adapter);

			await expect(service.delete('my-vectors', 'k1', 'k2')).rejects.toThrow(
				'Bulk delete failed'
			);
		});
	});

	describe('Exists Operation', () => {
		test('returns true when storage exists', async () => {
			const { adapter } = createMockAdapter([{ ok: true, data: { success: true, data: [] } }]);

			const service = new VectorStorageService(baseUrl, adapter);
			const result = await service.exists('my-vectors');

			expect(result).toBe(true);
		});

		test('returns false when storage does not exist', async () => {
			const { adapter } = createMockAdapter([], {
				onBefore: async () => {
					throw new Error('Not Found 404');
				},
			});

			const service = new VectorStorageService(baseUrl, adapter);
			const result = await service.exists('non-existent');

			expect(result).toBe(false);
		});
	});

	// ===================================================================
	// 3. ERROR HANDLING TESTS
	// ===================================================================

	describe('Error Handling', () => {
		test('throws error on API failure', async () => {
			const { adapter } = createMockAdapter([
				{ ok: false, status: 500, body: { message: 'Internal server error' } },
			]);

			const service = new VectorStorageService(baseUrl, adapter);

			await expect(
				service.upsert('my-vectors', { key: 'k1', document: 'test' })
			).rejects.toThrow();
		});

		test('throws error when response has success:false', async () => {
			const { adapter } = createMockAdapter([
				{ ok: true, data: { success: false, message: 'Vector storage limit exceeded' } },
			]);

			const service = new VectorStorageService(baseUrl, adapter);

			await expect(
				service.upsert('my-vectors', { key: 'k1', document: 'test' })
			).rejects.toThrow('Vector storage limit exceeded');
		});

		test('respects timeout for operations', async () => {
			const { adapter, calls } = createMockAdapter([
				{ ok: true, data: { success: true, data: [] } },
			]);

			const service = new VectorStorageService(baseUrl, adapter);
			await service.search('my-vectors', { query: 'test' });

			expect(calls.length).toBe(1);
			expect(calls[0].options.signal).toBeDefined();
		});
	});

	// ===================================================================
	// 4. EDGE CASE TESTS
	// ===================================================================

	describe('Edge Cases', () => {
		test('handles very long document text', async () => {
			const { adapter, calls } = createMockAdapter([
				{ ok: true, data: { success: true, data: [{ id: 'vec-1' }] } },
			]);

			const service = new VectorStorageService(baseUrl, adapter);
			const longText = 'a'.repeat(100000);

			await service.upsert('my-vectors', { key: 'k1', document: longText });

			expect(calls.length).toBe(1);
		});

		test('handles special characters in storage name and keys', async () => {
			const { adapter, calls } = createMockAdapter([
				{ ok: true, data: { success: true, data: [{ id: 'vec-1' }] } },
			]);

			const service = new VectorStorageService(baseUrl, adapter);

			await service.upsert('my-vectors/special chars!', {
				key: 'key with spaces & symbols',
				document: 'test',
			});

			const url = calls[0].url;
			expect(url).toContain('my-vectors%2Fspecial');
		});

		test('handles large embeddings array', async () => {
			const { adapter, calls } = createMockAdapter([
				{ ok: true, data: { success: true, data: [{ id: 'vec-1' }] } },
			]);

			const service = new VectorStorageService(baseUrl, adapter);
			const largeEmbeddings = Array.from({ length: 1536 }, (_, i) => i * 0.001);

			await service.upsert('my-vectors', { key: 'k1', embeddings: largeEmbeddings });

			expect(calls.length).toBe(1);
		});

		test('handles complex metadata objects', async () => {
			const { adapter, calls } = createMockAdapter([
				{ ok: true, data: { success: true, data: [{ id: 'vec-1' }] } },
			]);

			const service = new VectorStorageService(baseUrl, adapter);

			await service.upsert('my-vectors', {
				key: 'k1',
				document: 'test',
				metadata: {
					user: { id: 123, name: 'John' },
					tags: ['important', 'verified'],
					timestamp: Date.now(),
				},
			});

			const body = JSON.parse(calls[0].options.body as string);
			expect(body[0].metadata.user.name).toBe('John');
			expect(body[0].metadata.tags).toEqual(['important', 'verified']);
		});
	});

	// ===================================================================
	// 5. INTEGRATION TEST
	// ===================================================================

	describe('Integration Workflow', () => {
		test('complete vector workflow: upsert -> search -> get -> getMany -> delete -> exists', async () => {
			const { adapter } = createMockAdapter([
				// exists (search)
				{ ok: true, data: { success: true, data: [] } },
				// upsert
				{
					ok: true,
					data: { success: true, data: [{ id: 'vec-0' }, { id: 'vec-1' }] },
				},
				// get (doc1)
				{
					ok: true,
					data: {
						success: true,
						data: {
							id: 'vec-1',
							key: 'doc1',
							similarity: 1.0,
							document: 'First document',
						},
					},
				},
				// getMany (doc1)
				{
					ok: true,
					data: {
						success: true,
						data: {
							id: 'vec-0',
							key: 'doc1',
							similarity: 1.0,
							document: 'First document',
						},
					},
				},
				// getMany (doc2)
				{
					ok: true,
					data: {
						success: true,
						data: {
							id: 'vec-1',
							key: 'doc2',
							similarity: 1.0,
							document: 'Second document',
						},
					},
				},
				// search
				{
					ok: true,
					data: {
						success: true,
						data: [
							{ id: 'vec-0', key: 'doc1', similarity: 0.9, metadata: { type: 'test' } },
							{ id: 'vec-1', key: 'doc2', similarity: 0.9, metadata: { type: 'test' } },
						],
					},
				},
				// delete
				{ ok: true, data: { success: true, data: 2 } },
			]);

			const service = new VectorStorageService(baseUrl, adapter);

			// Check if exists (should exist after creation)
			const existsBefore = await service.exists('test-vectors');
			expect(existsBefore).toBe(true);

			// Upsert
			const results = await service.upsert(
				'test-vectors',
				{ key: 'doc1', document: 'First document', metadata: { type: 'test' } },
				{ key: 'doc2', document: 'Second document', metadata: { type: 'test' } }
			);
			expect(results).toEqual([
				{ key: 'doc1', id: 'vec-0' },
				{ key: 'doc2', id: 'vec-1' },
			]);

			// Get single
			const getResult = await service.get('test-vectors', 'doc1');
			expect(getResult.exists).toBe(true);
			if (getResult.exists) {
				expect(getResult.data.key).toBe('doc1');
			}

			// GetMany
			const manyResults = await service.getMany('test-vectors', 'doc1', 'doc2');
			expect(manyResults.size).toBe(2);
			expect(manyResults.has('doc1')).toBe(true);

			// Search
			const searchResults = await service.search('test-vectors', { query: 'document' });
			expect(searchResults).toHaveLength(2);

			// Delete
			const deleteCount = await service.delete('test-vectors', 'doc1', 'doc2');
			expect(deleteCount).toBe(2);
		});
	});

	// ===================================================================
	// 6. STATS AND NAMESPACE MANAGEMENT TESTS
	// ===================================================================

	describe('Input Validation - GetStats', () => {
		test('rejects empty storage name', async () => {
			const { adapter } = createMockAdapter([]);
			const service = new VectorStorageService(baseUrl, adapter);

			await expect(service.getStats('')).rejects.toThrow(
				'Vector storage name is required and must be a non-empty string'
			);
		});

		test('rejects whitespace-only storage name', async () => {
			const { adapter } = createMockAdapter([]);
			const service = new VectorStorageService(baseUrl, adapter);

			await expect(service.getStats('   ')).rejects.toThrow(
				'Vector storage name is required and must be a non-empty string'
			);
		});
	});

	describe('Input Validation - DeleteNamespace', () => {
		test('rejects empty storage name', async () => {
			const { adapter } = createMockAdapter([]);
			const service = new VectorStorageService(baseUrl, adapter);

			await expect(service.deleteNamespace('')).rejects.toThrow(
				'Vector storage name is required and must be a non-empty string'
			);
		});

		test('rejects whitespace-only storage name', async () => {
			const { adapter } = createMockAdapter([]);
			const service = new VectorStorageService(baseUrl, adapter);

			await expect(service.deleteNamespace('   ')).rejects.toThrow(
				'Vector storage name is required and must be a non-empty string'
			);
		});
	});

	describe('GetStats Operation', () => {
		test('returns namespace stats with sampled results', async () => {
			const { adapter, calls } = createMockAdapter([
				{
					ok: true,
					data: {
						sum: 1024,
						count: 5,
						createdAt: 1700000000000,
						lastUsed: 1700001000000,
						sampledResults: {
							doc1: {
								embedding: [0.1, 0.2],
								document: 'Test document',
								size: 256,
								metadata: { type: 'test' },
								firstUsed: 1700000000000,
								lastUsed: 1700001000000,
								count: 3,
							},
						},
					},
				},
			]);

			const service = new VectorStorageService(baseUrl, adapter);
			const stats = await service.getStats('my-vectors');

			expect(stats.sum).toBe(1024);
			expect(stats.count).toBe(5);
			expect(stats.createdAt).toBe(1700000000000);
			expect(stats.lastUsed).toBe(1700001000000);
			expect(stats.sampledResults).toBeDefined();
			expect(stats.sampledResults?.doc1.size).toBe(256);
			expect(calls).toHaveLength(1);
			expect(calls[0].url).toBe(`${baseUrl}/vector/2025-03-17/stats/my-vectors`);
			expect(calls[0].options.method).toBe('GET');
		});

		test('returns empty stats for non-existent namespace (404)', async () => {
			const { adapter } = createMockAdapter([{ ok: false, status: 404 }]);

			const service = new VectorStorageService(baseUrl, adapter);
			const stats = await service.getStats('non-existent');

			expect(stats.sum).toBe(0);
			expect(stats.count).toBe(0);
		});

		test('includes telemetry in request', async () => {
			const { adapter, calls } = createMockAdapter([{ ok: true, data: { sum: 0, count: 0 } }]);

			const service = new VectorStorageService(baseUrl, adapter);
			await service.getStats('my-vectors');

			expect(calls[0].options).toMatchObject({
				telemetry: {
					name: 'agentuity.vector.getStats',
					attributes: { name: 'my-vectors' },
				},
			});
		});
	});

	describe('GetAllStats Operation', () => {
		test('returns stats for all namespaces', async () => {
			const { adapter, calls } = createMockAdapter([
				{
					ok: true,
					data: {
						products: { sum: 1024, count: 10, createdAt: 1700000000000 },
						embeddings: { sum: 2048, count: 20, lastUsed: 1700001000000 },
					},
				},
			]);

			const service = new VectorStorageService(baseUrl, adapter);
			const allStats = await service.getAllStats();

			expect(Object.keys(allStats)).toHaveLength(2);
			expect(allStats.products.count).toBe(10);
			expect(allStats.embeddings.count).toBe(20);
			expect(calls).toHaveLength(1);
			expect(calls[0].url).toBe(`${baseUrl}/vector/2025-03-17/stats`);
		});

		test('returns empty object when no namespaces exist', async () => {
			const { adapter } = createMockAdapter([{ ok: true, data: {} }]);

			const service = new VectorStorageService(baseUrl, adapter);
			const allStats = await service.getAllStats();

			expect(Object.keys(allStats)).toHaveLength(0);
		});

		test('includes telemetry in request', async () => {
			const { adapter, calls } = createMockAdapter([{ ok: true, data: {} }]);

			const service = new VectorStorageService(baseUrl, adapter);
			await service.getAllStats();

			expect(calls[0].options).toMatchObject({
				telemetry: {
					name: 'agentuity.vector.getAllStats',
					attributes: {},
				},
			});
		});
	});

	describe('GetNamespaces Operation', () => {
		test('returns array of namespace names', async () => {
			const { adapter } = createMockAdapter([
				{
					ok: true,
					data: {
						products: { sum: 1024, count: 10 },
						embeddings: { sum: 2048, count: 20 },
						documents: { sum: 512, count: 5 },
					},
				},
			]);

			const service = new VectorStorageService(baseUrl, adapter);
			const namespaces = await service.getNamespaces();

			expect(namespaces).toHaveLength(3);
			expect(namespaces).toContain('products');
			expect(namespaces).toContain('embeddings');
			expect(namespaces).toContain('documents');
		});

		test('returns empty array when no namespaces exist', async () => {
			const { adapter } = createMockAdapter([{ ok: true, data: {} }]);

			const service = new VectorStorageService(baseUrl, adapter);
			const namespaces = await service.getNamespaces();

			expect(namespaces).toHaveLength(0);
		});
	});

	describe('DeleteNamespace Operation', () => {
		test('successfully deletes namespace', async () => {
			const { adapter, calls } = createMockAdapter([
				{ ok: true, data: { success: true, data: 10 } },
			]);

			const service = new VectorStorageService(baseUrl, adapter);
			await service.deleteNamespace('my-vectors');

			expect(calls).toHaveLength(1);
			expect(calls[0].url).toBe(`${baseUrl}/vector/2025-03-17/my-vectors`);
			expect(calls[0].options.method).toBe('DELETE');
			expect(calls[0].options.body).toBeUndefined();
		});

		test('handles 404 gracefully (namespace does not exist)', async () => {
			const { adapter } = createMockAdapter([{ ok: false, status: 404 }]);

			const service = new VectorStorageService(baseUrl, adapter);

			// Should not throw
			await expect(service.deleteNamespace('non-existent')).resolves.toBeUndefined();
		});

		test('encodes namespace name in URL', async () => {
			const { adapter, calls } = createMockAdapter([
				{ ok: true, data: { success: true, data: 5 } },
			]);

			const service = new VectorStorageService(baseUrl, adapter);
			await service.deleteNamespace('my vectors/special');

			expect(calls[0].url).toContain('my%20vectors%2Fspecial');
		});

		test('includes telemetry in request', async () => {
			const { adapter, calls } = createMockAdapter([
				{ ok: true, data: { success: true, data: 0 } },
			]);

			const service = new VectorStorageService(baseUrl, adapter);
			await service.deleteNamespace('my-vectors');

			expect(calls[0].options).toMatchObject({
				telemetry: {
					name: 'agentuity.vector.deleteNamespace',
					attributes: { name: 'my-vectors' },
				},
			});
		});

		test('throws error when server returns success:false', async () => {
			const { adapter } = createMockAdapter([
				{ ok: true, data: { success: false, message: 'Namespace deletion failed' } },
			]);

			const service = new VectorStorageService(baseUrl, adapter);

			await expect(service.deleteNamespace('my-vectors')).rejects.toThrow(
				'Namespace deletion failed'
			);
		});
	});

	describe('Stats and Namespace Workflow', () => {
		test('complete workflow: getAllStats -> getStats -> getNamespaces -> deleteNamespace', async () => {
			const { adapter } = createMockAdapter([
				// getAllStats
				{
					ok: true,
					data: {
						products: { sum: 1024, count: 10, createdAt: 1700000000000 },
						test: { sum: 256, count: 2 },
					},
				},
				// getStats
				{
					ok: true,
					data: {
						sum: 1024,
						count: 10,
						createdAt: 1700000000000,
						sampledResults: {
							item1: {
								size: 128,
								firstUsed: 1700000000000,
								lastUsed: 1700001000000,
								count: 5,
							},
						},
					},
				},
				// getNamespaces (via getAllStats)
				{
					ok: true,
					data: {
						products: { sum: 1024, count: 10 },
						test: { sum: 256, count: 2 },
					},
				},
				// deleteNamespace
				{ ok: true, data: { success: true, data: 2 } },
			]);

			const service = new VectorStorageService(baseUrl, adapter);

			// Get all stats
			const allStats = await service.getAllStats();
			expect(Object.keys(allStats)).toHaveLength(2);
			expect(allStats.products.count).toBe(10);

			// Get specific namespace stats
			const stats = await service.getStats('products');
			expect(stats.count).toBe(10);
			expect(stats.sampledResults?.item1.count).toBe(5);

			// Get namespace list
			const namespaces = await service.getNamespaces();
			expect(namespaces).toContain('products');
			expect(namespaces).toContain('test');

			// Delete namespace
			await service.deleteNamespace('test');
		});
	});
});
