import type { Database } from 'bun:sqlite';
import type {
	VectorStorage,
	VectorUpsertParams,
	VectorUpsertResult,
	VectorResult,
	VectorResultNotFound,
	VectorSearchResultWithDocument,
	VectorSearchParams,
	VectorSearchResult,
	VectorNamespaceStats,
	VectorNamespaceStatsWithSamples,
} from '@agentuity/core';
import { randomUUID } from 'node:crypto';
import { simpleEmbedding, cosineSimilarity, now } from './_util';

export class LocalVectorStorage implements VectorStorage {
	#db: Database;
	#projectPath: string;

	constructor(db: Database, projectPath: string) {
		this.#db = db;
		this.#projectPath = projectPath;
	}

	async upsert(name: string, ...documents: VectorUpsertParams[]): Promise<VectorUpsertResult[]> {
		if (!name?.trim()) {
			throw new Error('Vector storage name is required');
		}
		if (documents.length === 0) {
			throw new Error('At least one document is required');
		}

		const results: VectorUpsertResult[] = [];
		const stmt = this.#db.prepare(`
			INSERT INTO vector_storage (
				project_path, name, id, key, embedding, document, metadata, created_at, updated_at
			)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(project_path, name, key) 
			DO UPDATE SET 
				embedding = excluded.embedding,
				document = excluded.document,
				metadata = excluded.metadata,
				updated_at = excluded.updated_at
		`);

		for (const doc of documents) {
			if (!doc.key?.trim()) {
				throw new Error('Each document must have a non-empty key');
			}

			// Generate or use provided embeddings
			let embedding: number[];
			if ('embeddings' in doc && doc.embeddings) {
				if (!Array.isArray(doc.embeddings) || doc.embeddings.length === 0) {
					throw new Error('Embeddings must be a non-empty array');
				}
				embedding = doc.embeddings;
			} else if ('document' in doc && doc.document) {
				if (!doc.document?.trim()) {
					throw new Error('Document text must be non-empty');
				}
				embedding = simpleEmbedding(doc.document);
			} else {
				throw new Error('Each document must have either embeddings or document text');
			}

			const id = randomUUID();
			const timestamp = now();
			const embeddingJson = JSON.stringify(embedding);
			const documentText = 'document' in doc ? doc.document : null;
			const metadata = doc.metadata ? JSON.stringify(doc.metadata) : null;

			stmt.run(
				this.#projectPath,
				name,
				id,
				doc.key,
				embeddingJson,
				documentText ?? null,
				metadata ?? null,
				timestamp,
				timestamp
			);

			const row = this.#db
				.prepare(
					'SELECT id FROM vector_storage WHERE project_path = ? AND name = ? AND key = ?'
				)
				.get(this.#projectPath, name, doc.key) as { id: string } | undefined;

			const actualId = row?.id ?? id;
			results.push({ key: doc.key, id: actualId });
		}

		return results;
	}

	async get<T extends Record<string, unknown> = Record<string, unknown>>(
		name: string,
		key: string
	): Promise<VectorResult<T>> {
		if (!name?.trim() || !key?.trim()) {
			throw new Error('Vector storage name and key are required');
		}

		const query = this.#db.query(`
			SELECT id, key, embedding, document, metadata 
			FROM vector_storage 
			WHERE project_path = ? AND name = ? AND key = ?
		`);

		const row = query.get(this.#projectPath, name, key) as {
			id: string;
			key: string;
			embedding: string;
			document: string | null;
			metadata: string | null;
		} | null;

		if (!row) {
			return { exists: false } as VectorResultNotFound;
		}

		return {
			exists: true,
			data: {
				id: row.id,
				key: row.key,
				embeddings: JSON.parse(row.embedding),
				document: row.document || undefined,
				metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
				similarity: 1.0, // Perfect match for direct get
			} as VectorSearchResultWithDocument<T>,
		};
	}

	async getMany<T extends Record<string, unknown> = Record<string, unknown>>(
		name: string,
		...keys: string[]
	): Promise<Map<string, VectorSearchResultWithDocument<T>>> {
		if (!name?.trim()) {
			throw new Error('Vector storage name is required');
		}
		if (keys.length === 0) {
			return new Map();
		}

		const results = await Promise.all(
			keys.map(async (key) => {
				const result = await this.get<T>(name, key);
				return { key, result };
			})
		);

		const map = new Map<string, VectorSearchResultWithDocument<T>>();
		for (const { key, result } of results) {
			if (result.exists) {
				map.set(key, result.data);
			}
		}

		return map;
	}

	async search<T extends Record<string, unknown> = Record<string, unknown>>(
		name: string,
		params: VectorSearchParams<T>
	): Promise<VectorSearchResult<T>[]> {
		if (!name?.trim()) {
			throw new Error('Vector storage name is required');
		}
		if (!params.query?.trim()) {
			throw new Error('Query is required');
		}

		// Fetch all vectors for this name
		const query = this.#db.query(`
			SELECT id, key, embedding, metadata 
			FROM vector_storage 
			WHERE project_path = ? AND name = ?
		`);

		const rows = query.all(this.#projectPath, name) as Array<{
			id: string;
			key: string;
			embedding: string;
			metadata: string | null;
		}>;

		// If no vectors exist, return empty results
		const row = rows[0];
		if (!row) {
			return [];
		}

		// Detect dimensionality from first stored vector
		const firstEmbedding = JSON.parse(row.embedding);
		const dimensions = firstEmbedding.length;

		// Generate query embedding with matching dimensions
		const queryEmbedding = simpleEmbedding(params.query, dimensions);

		// Calculate similarities
		const results: Array<VectorSearchResult<T> & { similarity: number }> = [];

		for (const row of rows) {
			const embedding = JSON.parse(row.embedding);
			const similarity = cosineSimilarity(queryEmbedding, embedding);

			// Apply similarity threshold
			if (params.similarity !== undefined && similarity < params.similarity) {
				continue;
			}

			// Apply metadata filter
			if (params.metadata) {
				const rowMetadata = row.metadata ? JSON.parse(row.metadata) : {};
				const matches = Object.entries(params.metadata).every(
					([key, value]) => rowMetadata[key] === value
				);
				if (!matches) {
					continue;
				}
			}

			results.push({
				id: row.id,
				key: row.key,
				metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
				similarity,
			} as VectorSearchResult<T> & { similarity: number });
		}

		// Sort by similarity descending
		results.sort((a, b) => b.similarity - a.similarity);

		// Apply limit
		const limit = params.limit || 10;
		return results.slice(0, limit);
	}

	async delete(name: string, ...keys: string[]): Promise<number> {
		if (!name?.trim()) {
			throw new Error('Vector storage name is required');
		}
		if (keys.length === 0) {
			return 0;
		}

		const placeholders = keys.map(() => '?').join(', ');
		const stmt = this.#db.prepare(`
			DELETE FROM vector_storage 
			WHERE project_path = ? AND name = ? AND key IN (${placeholders})
		`);

		const result = stmt.run(this.#projectPath, name, ...keys);
		return result.changes;
	}

	async exists(name: string): Promise<boolean> {
		if (!name?.trim()) {
			throw new Error('Vector storage name is required');
		}

		const query = this.#db.query(`
			SELECT COUNT(*) as count 
			FROM vector_storage 
			WHERE project_path = ? AND name = ?
		`);

		const { count } = query.get(this.#projectPath, name) as { count: number };
		return count > 0;
	}

	async getStats(name: string): Promise<VectorNamespaceStatsWithSamples> {
		if (!name?.trim()) {
			throw new Error('Vector storage name is required');
		}

		const countQuery = this.#db.query(`
			SELECT COUNT(*) as count,
			MIN(created_at) as created_at, MAX(updated_at) as last_used
			FROM vector_storage 
			WHERE project_path = ? AND name = ?
		`);

		const stats = countQuery.get(this.#projectPath, name) as {
			count: number;
			created_at: number | null;
			last_used: number | null;
		};

		if (stats.count === 0) {
			return { sum: 0, count: 0 };
		}

		const sampleQuery = this.#db.query(`
			SELECT key, embedding, document, metadata, created_at, updated_at
			FROM vector_storage 
			WHERE project_path = ? AND name = ?
			LIMIT 20
		`);

		const samples = sampleQuery.all(this.#projectPath, name) as Array<{
			key: string;
			embedding: string;
			document: string | null;
			metadata: string | null;
			created_at: number;
			updated_at: number;
		}>;

		const encoder = new TextEncoder();
		let totalSum = 0;
		const sampledResults: VectorNamespaceStatsWithSamples['sampledResults'] = {};
		for (const sample of samples) {
			const embeddingBytes = encoder.encode(sample.embedding).length;
			const documentBytes = sample.document ? encoder.encode(sample.document).length : 0;
			const size = embeddingBytes + documentBytes;
			totalSum += size;
			sampledResults![sample.key] = {
				embedding: JSON.parse(sample.embedding),
				document: sample.document || undefined,
				size,
				metadata: sample.metadata ? JSON.parse(sample.metadata) : undefined,
				firstUsed: sample.created_at,
				lastUsed: sample.updated_at,
			};
		}

		// Estimate total size based on sampled average if we have more records than samples
		const estimatedSum =
			stats.count <= samples.length
				? totalSum
				: Math.round((totalSum / samples.length) * stats.count);

		return {
			sum: estimatedSum,
			count: stats.count,
			createdAt: stats.created_at || undefined,
			lastUsed: stats.last_used || undefined,
			sampledResults,
		};
	}

	async getAllStats(): Promise<Record<string, VectorNamespaceStats>> {
		const query = this.#db.query(`
			SELECT name, embedding, document
			FROM vector_storage 
			WHERE project_path = ?
		`);

		const rows = query.all(this.#projectPath) as Array<{
			name: string;
			embedding: string;
			document: string | null;
		}>;

		const encoder = new TextEncoder();
		const namespaceStats = new Map<
			string,
			{ sum: number; count: number; createdAt?: number; lastUsed?: number }
		>();

		for (const row of rows) {
			const embeddingBytes = encoder.encode(row.embedding).length;
			const documentBytes = row.document ? encoder.encode(row.document).length : 0;
			const size = embeddingBytes + documentBytes;

			const existing = namespaceStats.get(row.name);
			if (existing) {
				existing.sum += size;
				existing.count += 1;
			} else {
				namespaceStats.set(row.name, { sum: size, count: 1 });
			}
		}

		// Get timestamps in a separate query
		const timestampQuery = this.#db.query(`
			SELECT name, MIN(created_at) as created_at, MAX(updated_at) as last_used
			FROM vector_storage 
			WHERE project_path = ?
			GROUP BY name
		`);

		const timestamps = timestampQuery.all(this.#projectPath) as Array<{
			name: string;
			created_at: number | null;
			last_used: number | null;
		}>;

		for (const ts of timestamps) {
			const stats = namespaceStats.get(ts.name);
			if (stats) {
				stats.createdAt = ts.created_at || undefined;
				stats.lastUsed = ts.last_used || undefined;
			}
		}

		const results: Record<string, VectorNamespaceStats> = {};
		for (const [name, stats] of namespaceStats) {
			results[name] = stats;
		}

		return results;
	}

	async getNamespaces(): Promise<string[]> {
		const query = this.#db.query(`
			SELECT DISTINCT name 
			FROM vector_storage 
			WHERE project_path = ?
		`);

		const rows = query.all(this.#projectPath) as Array<{ name: string }>;
		return rows.map((row) => row.name);
	}

	async deleteNamespace(name: string): Promise<void> {
		if (!name?.trim()) {
			throw new Error('Vector storage name is required');
		}

		const stmt = this.#db.prepare(`
			DELETE FROM vector_storage 
			WHERE project_path = ? AND name = ?
		`);

		stmt.run(this.#projectPath, name);
	}
}
