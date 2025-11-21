import type { Database } from 'bun:sqlite';
import type {
	ObjectStorage,
	ObjectResult,
	ObjectResultNotFound,
	ObjectStorePutParams,
	CreatePublicURLParams,
	BucketInfo,
	ObjectInfo,
} from '@agentuity/core';
import { now } from './_util';

export class LocalObjectStorage implements ObjectStorage {
	#db: Database;
	#projectPath: string;
	#serverUrl: string;

	constructor(db: Database, projectPath: string, serverUrl: string) {
		this.#db = db;
		this.#projectPath = projectPath;
		this.#serverUrl = serverUrl;
	}

	async get(bucket: string, key: string): Promise<ObjectResult> {
		if (!bucket?.trim() || !key?.trim()) {
			throw new Error('bucket and key are required');
		}

		const query = this.#db.query(`
			SELECT data, content_type 
			FROM object_storage 
			WHERE project_path = ? AND bucket = ? AND key = ?
		`);

		const row = query.get(this.#projectPath, bucket, key) as {
			data: Buffer;
			content_type: string;
		} | null;

		if (!row) {
			return { exists: false } as ObjectResultNotFound;
		}

		return {
			exists: true,
			data: new Uint8Array(row.data),
			contentType: row.content_type,
		};
	}

	async put(
		bucket: string,
		key: string,
		data: Uint8Array | ArrayBuffer | ReadableStream,
		params?: ObjectStorePutParams
	): Promise<void> {
		if (!bucket?.trim() || !key?.trim()) {
			throw new Error('bucket and key are required');
		}

		// Convert data to Buffer
		let buffer: Buffer;
		if (data instanceof ReadableStream) {
			// Read entire stream into buffer
			const reader = data.getReader();
			const chunks: Uint8Array[] = [];
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				chunks.push(value);
			}
			const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
			buffer = Buffer.concat(
				chunks.map((c) => Buffer.from(c)),
				totalLength
			);
		} else if (data instanceof ArrayBuffer) {
			buffer = Buffer.from(data);
		} else {
			buffer = Buffer.from(data);
		}

		const timestamp = now();
		const metadata = params?.metadata ? JSON.stringify(params.metadata) : null;

		const stmt = this.#db.prepare(`
			INSERT INTO object_storage (
				project_path, bucket, key, data, content_type, 
				content_encoding, cache_control, content_disposition, 
				content_language, metadata, created_at, updated_at
			)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(project_path, bucket, key) 
			DO UPDATE SET 
				data = excluded.data,
				content_type = excluded.content_type,
				content_encoding = excluded.content_encoding,
				cache_control = excluded.cache_control,
				content_disposition = excluded.content_disposition,
				content_language = excluded.content_language,
				metadata = excluded.metadata,
				updated_at = excluded.updated_at
		`);

		stmt.run(
			this.#projectPath,
			bucket,
			key,
			buffer,
			params?.contentType || 'application/octet-stream',
			params?.contentEncoding || null,
			params?.cacheControl || null,
			params?.contentDisposition || null,
			params?.contentLanguage || null,
			metadata,
			timestamp,
			timestamp
		);
	}

	async delete(bucket: string, key: string): Promise<boolean> {
		if (!bucket?.trim() || !key?.trim()) {
			throw new Error('bucket and key are required');
		}

		const stmt = this.#db.prepare(`
			DELETE FROM object_storage 
			WHERE project_path = ? AND bucket = ? AND key = ?
		`);

		const result = stmt.run(this.#projectPath, bucket, key);
		return result.changes > 0;
	}

	async createPublicURL(
		bucket: string,
		key: string,
		_params?: CreatePublicURLParams
	): Promise<string> {
		if (!bucket?.trim() || !key?.trim()) {
			throw new Error('bucket and key are required');
		}

		// Verify object exists
		const result = await this.get(bucket, key);
		if (!result.exists) {
			throw new Error('Object not found');
		}

		// Return local HTTP URL
		// Note: params.expiresDuration is ignored for local implementation
		return `${this.#serverUrl}/_agentuity/local/object/${encodeURIComponent(bucket)}/${encodeURIComponent(key)}`;
	}

	async listBuckets(): Promise<BucketInfo[]> {
		throw new Error('listBuckets not implemented for local storage');
	}

	async listKeys(_bucket: string): Promise<ObjectInfo[]> {
		throw new Error('listKeys not implemented for local storage');
	}

	async listObjects(_bucket: string, _options?: { prefix?: string; limit?: number }): Promise<ObjectInfo[]> {
		throw new Error('listObjects not implemented for local storage');
	}

	async headObject(_bucket: string, _key: string): Promise<ObjectInfo> {
		throw new Error('headObject not implemented for local storage');
	}

	async deleteBucket(_bucket: string): Promise<boolean> {
		throw new Error('deleteBucket not implemented for local storage');
	}
}
