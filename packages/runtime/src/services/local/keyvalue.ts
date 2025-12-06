import type { Database } from 'bun:sqlite';
import type {
	KeyValueStorage,
	DataResult,
	DataResultNotFound,
	KeyValueStorageSetParams,
	KeyValueStats,
	KeyValueItemWithMetadata,
} from '@agentuity/core';
import { now } from './_util';

export class LocalKeyValueStorage implements KeyValueStorage {
	#db: Database;
	#projectPath: string;

	constructor(db: Database, projectPath: string) {
		this.#db = db;
		this.#projectPath = projectPath;
	}

	async get<T>(name: string, key: string): Promise<DataResult<T>> {
		const query = this.#db.query(`
			SELECT value, content_type, expires_at 
			FROM kv_storage 
			WHERE project_path = ? AND name = ? AND key = ?
		`);

		const row = query.get(this.#projectPath, name, key) as {
			value: Buffer;
			content_type: string;
			expires_at: number | null;
		} | null;

		if (!row) {
			return { exists: false } as DataResultNotFound;
		}

		// Check expiration
		if (row.expires_at && row.expires_at < now()) {
			// Delete expired row
			await this.delete(name, key);
			return { exists: false } as DataResultNotFound;
		}

		// Deserialize based on content type
		let data: T;
		if (row.content_type === 'application/json') {
			data = JSON.parse(row.value.toString('utf-8'));
		} else if (row.content_type.startsWith('text/')) {
			data = row.value.toString('utf-8') as T;
		} else {
			data = new Uint8Array(row.value) as T;
		}

		return {
			data,
			contentType: row.content_type,
			exists: true,
		};
	}

	async set<T = unknown>(
		name: string,
		key: string,
		value: T,
		params?: KeyValueStorageSetParams
	): Promise<void> {
		// Validate TTL
		if (params?.ttl && params.ttl < 60) {
			throw new Error(`ttl must be at least 60 seconds, got ${params.ttl}`);
		}

		// Serialize value
		let buffer: Buffer;
		let contentType = params?.contentType || 'application/octet-stream';

		if (typeof value === 'string') {
			buffer = Buffer.from(value, 'utf-8');
			if (!params?.contentType) {
				contentType = 'text/plain';
			}
		} else if (value instanceof Uint8Array) {
			buffer = Buffer.from(value);
		} else if (value instanceof ArrayBuffer) {
			buffer = Buffer.from(new Uint8Array(value));
		} else if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'object') {
			// Use JSON for numbers, booleans, and objects to preserve type on round-trip
			buffer = Buffer.from(JSON.stringify(value), 'utf-8');
			contentType = 'application/json';
		} else {
			// Fallback for other types
			buffer = Buffer.from(String(value), 'utf-8');
		}

		// Calculate expiration
		const expiresAt = params?.ttl ? now() + params.ttl * 1000 : null;
		const timestamp = now();

		// UPSERT
		const stmt = this.#db.prepare(`
			INSERT INTO kv_storage (project_path, name, key, value, content_type, expires_at, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(project_path, name, key) 
			DO UPDATE SET 
				value = excluded.value,
				content_type = excluded.content_type,
				expires_at = excluded.expires_at,
				updated_at = excluded.updated_at
		`);

		stmt.run(this.#projectPath, name, key, buffer, contentType, expiresAt, timestamp, timestamp);
	}

	async delete(name: string, key: string): Promise<void> {
		const stmt = this.#db.prepare(`
			DELETE FROM kv_storage 
			WHERE project_path = ? AND name = ? AND key = ?
		`);

		stmt.run(this.#projectPath, name, key);
	}

	async getStats(_name: string): Promise<KeyValueStats> {
		throw new Error('getStats not implemented for local storage');
	}

	async getAllStats(): Promise<Record<string, KeyValueStats>> {
		throw new Error('getAllStats not implemented for local storage');
	}

	async getNamespaces(): Promise<string[]> {
		throw new Error('getNamespaces not implemented for local storage');
	}

	async search<T = unknown>(
		_name: string,
		_keyword: string
	): Promise<Record<string, KeyValueItemWithMetadata<T>>> {
		throw new Error('search not implemented for local storage');
	}

	async getKeys(_name: string): Promise<string[]> {
		throw new Error('getKeys not implemented for local storage');
	}

	async deleteNamespace(_name: string): Promise<void> {
		throw new Error('deleteNamespace not implemented for local storage');
	}

	async createNamespace(_name: string): Promise<void> {
		throw new Error('createNamespace not implemented for local storage');
	}
}
