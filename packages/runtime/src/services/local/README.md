# Local SQLite Services Implementation Plan

## Overview

Implement local SQLite-backed storage services for development and testing without requiring authentication or external service dependencies.

### Goals

- Provide fully functional local implementations of all 4 storage service interfaces
- Use Bun's built-in SQLite for storage
- Support multi-project data partitioning by normalized directory path
- Enable serving objects/streams via local HTTP endpoints
- Replace current unauthenticated error-throwing services in unauth-app

### Non-Goals

- Production performance optimization (acceptable for local dev only)
- Distributed/multi-process access
- Data persistence guarantees beyond SQLite durability

---

## Architecture

### Database Location

- **Path**: `$HOME/.config/agentuity/local.db`
- **Driver**: Bun's built-in SQLite (`bun:sqlite`)
- **Connection**: Singleton pattern to avoid multiple opens
- **Initialization**: Create directory and DB file if not exists
- **Auto-cleanup**: On startup, orphaned project data is automatically removed (projects whose directories no longer exist)

### Project Partitioning

All tables include a `project_path` column storing the **normalized absolute path** of the project directory. This allows:

- Multiple projects to share the same database
- Easy querying/filtering by project
- Data isolation between projects

### URL Generation

For `ObjectStorage.createPublicURL()` and stream URLs:

- Serve via local Hono routes mounted on the main app
- Pattern: `http://localhost:{port}/_agentuity/local/object/{bucket}/{key}`
- Pattern: `http://localhost:{port}/_agentuity/local/stream/{id}`
- Only available when running with local services enabled

---

## File Structure

```
packages/runtime/src/services/local/
├── index.ts              # Public exports
├── _db.ts                # Singleton DB connection & schema initialization
├── _util.ts              # Shared utilities (path normalization, embeddings)
├── _router.ts            # Hono router for serving objects and streams
├── keyvalue.ts           # LocalKeyValueStorage implementation
├── objectstore.ts        # LocalObjectStorage implementation
├── stream.ts             # LocalStreamStorage implementation
└── vector.ts             # LocalVectorStorage implementation
```

---

## Database Schema

### Table: `kv_storage`

```sql
CREATE TABLE IF NOT EXISTS kv_storage (
  project_path TEXT NOT NULL,
  name TEXT NOT NULL,
  key TEXT NOT NULL,
  value BLOB NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  expires_at INTEGER,  -- Unix timestamp in milliseconds, NULL = no expiration
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (project_path, name, key)
);

CREATE INDEX IF NOT EXISTS idx_kv_expires
  ON kv_storage(expires_at)
  WHERE expires_at IS NOT NULL;
```

**Notes**:

- `value` stored as BLOB (supports any binary data)
- `expires_at` checked on read, expired entries return `exists: false`
- Optional: Background cleanup job to DELETE expired rows

### Table: `object_storage`

```sql
CREATE TABLE IF NOT EXISTS object_storage (
  project_path TEXT NOT NULL,
  bucket TEXT NOT NULL,
  key TEXT NOT NULL,
  data BLOB NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  content_encoding TEXT,
  cache_control TEXT,
  content_disposition TEXT,
  content_language TEXT,
  metadata TEXT,  -- JSON string of Record<string, string>
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (project_path, bucket, key)
);
```

**Notes**:

- `metadata` stored as JSON string, parsed on retrieval
- All HTTP headers preserved for accurate `get()` responses

### Table: `stream_storage`

```sql
CREATE TABLE IF NOT EXISTS stream_storage (
  project_path TEXT NOT NULL,
  id TEXT PRIMARY KEY,  -- UUID
  name TEXT NOT NULL,
  metadata TEXT,  -- JSON string
  content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  data BLOB,  -- NULL until stream is closed
  size_bytes INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_stream_name
  ON stream_storage(project_path, name);

CREATE INDEX IF NOT EXISTS idx_stream_metadata
  ON stream_storage(metadata);
```

**Notes**:

- Stream is created with `data = NULL`
- Data buffered in memory during writes
- On `close()`, data persisted to BLOB
- `list()` supports filtering by name and metadata (JSON queries)

### Table: `vector_storage`

```sql
CREATE TABLE IF NOT EXISTS vector_storage (
  project_path TEXT NOT NULL,
  name TEXT NOT NULL,
  id TEXT PRIMARY KEY,  -- UUID
  key TEXT NOT NULL,
  embedding TEXT NOT NULL,  -- JSON array of numbers
  document TEXT,  -- Original text used for embedding (optional)
  metadata TEXT,  -- JSON object
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (project_path, name, key)
);

CREATE INDEX IF NOT EXISTS idx_vector_lookup
  ON vector_storage(project_path, name, key);

CREATE INDEX IF NOT EXISTS idx_vector_name
  ON vector_storage(project_path, name);
```

**Notes**:

- `embedding` stored as JSON array for simplicity
- `document` preserved for retrieval (matches API)
- `search()` does full table scan with in-memory similarity calc (acceptable for local dev)

---

## Implementation Details

### 1. Database Infrastructure (`_db.ts`)

```typescript
import { Database } from 'bun:sqlite';
import { mkdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

let dbInstance: Database | null = null;

export function getLocalDB(): Database {
	if (dbInstance) {
		return dbInstance;
	}

	const configDir = join(homedir(), '.config', 'agentuity');

	if (!existsSync(configDir)) {
		mkdirSync(configDir, { recursive: true });
	}

	const dbPath = join(configDir, 'local.db');
	dbInstance = new Database(dbPath);

	initializeTables(dbInstance);

	return dbInstance;
}

function initializeTables(db: Database): void {
	// Create all 4 tables with schemas defined above
	// Execute CREATE TABLE IF NOT EXISTS statements
	// Execute CREATE INDEX IF NOT EXISTS statements
}

function cleanupOrphanedProjects(db: Database): void {
	// Get the current project path to exclude from cleanup
	const currentProjectPath = process.cwd();

	// Query all tables for unique project paths
	// Combine and deduplicate all project paths
	// Check which paths no longer exist and are not the current project
	// Delete data for removed projects from all tables

	// Logs: "[LocalDB] Cleaned up data for N orphaned project(s)"
}

export function closeLocalDB(): void {
	if (dbInstance) {
		dbInstance.close();
		dbInstance = null;
	}
}
```

**Responsibilities**:

- Singleton pattern for DB connection
- Create config directory if missing
- Initialize all tables and indexes
- Provide cleanup function for tests

### 2. Shared Utilities (`_util.ts`)

```typescript
import { resolve } from 'node:path';

/**
 * Normalize a project path to an absolute path for consistent DB keys
 */
export function normalizeProjectPath(cwd: string = process.cwd()): string {
	return resolve(cwd);
}

/**
 * Simple character-based embedding for local vector search
 * Not production-quality, but good enough for local dev/testing
 */
export function simpleEmbedding(text: string, dimensions = 128): number[] {
	const vec = new Array(dimensions).fill(0);
	const normalized = text.toLowerCase();

	for (let i = 0; i < normalized.length; i++) {
		const charCode = normalized.charCodeAt(i);
		vec[i % dimensions] += Math.sin(charCode * (i + 1));
		vec[(i * 2) % dimensions] += Math.cos(charCode);
	}

	// Normalize vector
	const magnitude = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
	return magnitude > 0 ? vec.map((v) => v / magnitude) : vec;
}

/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
	if (a.length !== b.length) {
		throw new Error('Vectors must have the same dimension');
	}

	const dot = a.reduce((sum, ai, i) => sum + ai * b[i], 0);
	const normA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0));
	const normB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0));

	return normA > 0 && normB > 0 ? dot / (normA * normB) : 0;
}

/**
 * Get current timestamp in milliseconds
 */
export function now(): number {
	return Date.now();
}
```

### 3. KeyValue Storage (`keyvalue.ts`)

```typescript
import type { Database } from 'bun:sqlite';
import type { KeyValueStorage, DataResult, KeyValueStorageSetParams } from '@agentuity/core';
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
			// Optionally delete expired row
			this.delete(name, key);
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
		} else if (value instanceof Uint8Array || value instanceof ArrayBuffer) {
			buffer = Buffer.from(value);
		} else if (typeof value === 'object') {
			buffer = Buffer.from(JSON.stringify(value), 'utf-8');
			contentType = 'application/json';
		} else {
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
}
```

**Key Features**:

- TTL validation (≥60 seconds)
- Automatic expiration checking on `get()`
- Content-type aware serialization/deserialization
- UPSERT pattern for `set()`

### 4. Object Storage (`objectstore.ts`)

```typescript
import type { Database } from 'bun:sqlite';
import type {
	ObjectStorage,
	ObjectResult,
	ObjectStorePutParams,
	CreatePublicURLParams,
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
}
```

**Key Features**:

- ReadableStream support (reads entire stream into memory)
- Metadata stored as JSON
- Public URL generation pointing to local HTTP endpoint
- `delete()` returns true/false based on whether row was deleted

### 5. Stream Storage (`stream.ts`)

```typescript
import type { Database } from 'bun:sqlite';
import type {
	StreamStorage,
	Stream,
	CreateStreamProps,
	ListStreamsParams,
	ListStreamsResponse,
	StreamInfo,
} from '@agentuity/core';
import { now } from './_util';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { openSync, writeSync, closeSync, readFileSync } from 'node:fs';

export class LocalStreamStorage implements StreamStorage {
	#db: Database;
	#projectPath: string;
	#serverUrl: string;
	#tempDir: string;

	constructor(db: Database, projectPath: string, serverUrl: string) {
		this.#db = db;
		this.#projectPath = projectPath;
		this.#serverUrl = serverUrl;

		// Create temp directory for stream buffering
		this.#tempDir = join(homedir(), '.config', 'agentuity', 'streams');
		if (!existsSync(this.#tempDir)) {
			mkdirSync(this.#tempDir, { recursive: true });
		}
	}

	async create(name: string, props?: CreateStreamProps): Promise<Stream> {
		if (!name || name.length < 1 || name.length > 254) {
			throw new Error('Stream name must be between 1 and 254 characters');
		}

		const id = crypto.randomUUID();
		const timestamp = now();
		const metadata = props?.metadata ? JSON.stringify(props.metadata) : null;

		// Insert stream record with NULL data
		const stmt = this.#db.prepare(`
      INSERT INTO stream_storage (
        project_path, id, name, metadata, content_type, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `);

		stmt.run(
			this.#projectPath,
			id,
			name,
			metadata,
			props?.contentType || 'application/octet-stream',
			timestamp
		);

		const url = `${this.#serverUrl}/_agentuity/local/stream/${id}`;

		return new LocalStream(
			id,
			url,
			this.#db,
			this.#projectPath,
			this.#tempDir,
			props?.compress ?? false
		);
	}

	async list(params?: ListStreamsParams): Promise<ListStreamsResponse> {
		if (params?.limit && (params.limit <= 0 || params.limit > 1000)) {
			throw new Error('limit must be between 1 and 1000');
		}

		let query = `
      SELECT id, name, metadata, size_bytes 
      FROM stream_storage 
      WHERE project_path = ?
    `;
		const queryParams: any[] = [this.#projectPath];

		// Add filters
		if (params?.name) {
			query += ` AND name = ?`;
			queryParams.push(params.name);
		}

		if (params?.metadata) {
			// Simple JSON matching - check if metadata contains all key-value pairs
			for (const [key, value] of Object.entries(params.metadata)) {
				query += ` AND metadata LIKE ?`;
				queryParams.push(`%"${key}":"${value}"%`);
			}
		}

		// Get total count
		const countQuery = this.#db.query(
			query.replace('SELECT id, name, metadata, size_bytes', 'SELECT COUNT(*) as count')
		);
		const { count } = countQuery.get(...queryParams) as { count: number };

		// Add pagination
		query += ` ORDER BY created_at DESC`;
		if (params?.limit) {
			query += ` LIMIT ${params.limit}`;
		}
		if (params?.offset) {
			query += ` OFFSET ${params.offset}`;
		}

		const stmt = this.#db.query(query);
		const rows = stmt.all(...queryParams) as Array<{
			id: string;
			name: string;
			metadata: string | null;
			size_bytes: number;
		}>;

		const streams: StreamInfo[] = rows.map((row) => ({
			id: row.id,
			name: row.name,
			metadata: row.metadata ? JSON.parse(row.metadata) : {},
			url: `${this.#serverUrl}/_agentuity/local/stream/${row.id}`,
			sizeBytes: row.size_bytes,
		}));

		return {
			success: true,
			streams,
			total: count,
		};
	}

	async delete(id: string): Promise<void> {
		if (!id?.trim()) {
			throw new Error('Stream id is required');
		}

		const stmt = this.#db.prepare(`
      DELETE FROM stream_storage 
      WHERE project_path = ? AND id = ?
    `);

		stmt.run(this.#projectPath, id);
	}
}

class LocalStream extends WritableStream implements Stream {
	public readonly id: string;
	public readonly url: string;

	#db: Database;
	#projectPath: string;
	#compressed: boolean;
	#tempFilePath: string;
	#fileHandle: number | null = null;
	#bytesWritten = 0;
	#closed = false;

	constructor(
		id: string,
		url: string,
		db: Database,
		projectPath: string,
		tempDir: string,
		compressed: boolean
	) {
		super({
			write: async (chunk: Uint8Array) => {
				await this.#writeToFile(chunk);
			},
			close: async () => {
				await this.#persist();
			},
		});

		this.id = id;
		this.url = url;
		this.#db = db;
		this.#projectPath = projectPath;
		this.#compressed = compressed;
		this.#tempFilePath = join(tempDir, `${id}.tmp`);

		// Open file for writing
		this.#fileHandle = openSync(this.#tempFilePath, 'w');
	}

	get bytesWritten(): number {
		return this.#bytesWritten;
	}

	get compressed(): boolean {
		return this.#compressed;
	}

	async write(chunk: string | Uint8Array | ArrayBuffer | Buffer | object): Promise<void> {
		if (this.#closed) {
			throw new Error('Stream is closed');
		}

		let binary: Uint8Array;
		if (chunk instanceof Uint8Array) {
			binary = chunk;
		} else if (typeof chunk === 'string') {
			binary = new TextEncoder().encode(chunk);
		} else if (chunk instanceof ArrayBuffer) {
			binary = new Uint8Array(chunk);
		} else if (typeof chunk === 'object') {
			binary = new TextEncoder().encode(JSON.stringify(chunk));
		} else {
			binary = new TextEncoder().encode(String(chunk));
		}

		await this.#writeToFile(binary);
	}

	async close(): Promise<void> {
		if (this.#closed) {
			return;
		}

		this.#closed = true;

		// Close file handle if open
		if (this.#fileHandle !== null) {
			closeSync(this.#fileHandle);
			this.#fileHandle = null;
		}

		await this.#persist();
	}

	getReader(): ReadableStream<Uint8Array> {
		const db = this.#db;
		const projectPath = this.#projectPath;
		const id = this.id;

		return new ReadableStream({
			start(controller) {
				const query = db.query(`
          SELECT data FROM stream_storage 
          WHERE project_path = ? AND id = ?
        `);

				const row = query.get(projectPath, id) as { data: Buffer | null } | null;

				if (!row || !row.data) {
					controller.error(new Error('Stream not found or not finalized'));
					return;
				}

				controller.enqueue(new Uint8Array(row.data));
				controller.close();
			},
		});
	}

	async #writeToFile(chunk: Uint8Array): Promise<void> {
		if (this.#fileHandle === null) {
			throw new Error('File handle is closed');
		}

		const written = writeSync(this.#fileHandle, chunk);
		this.#bytesWritten += written;
	}

	async #persist(): Promise<void> {
		// Read buffered file
		let data = readFileSync(this.#tempFilePath);

		// Optional: Apply compression if enabled
		if (this.#compressed) {
			const { gzipSync } = await import('node:zlib');
			data = gzipSync(data);
		}

		// Update DB with finalized data
		const stmt = this.#db.prepare(`
      UPDATE stream_storage 
      SET data = ?, size_bytes = ? 
      WHERE project_path = ? AND id = ?
    `);

		stmt.run(data, this.#bytesWritten, this.#projectPath, this.id);

		// Clean up temp file
		try {
			unlinkSync(this.#tempFilePath);
		} catch (err) {
			// Ignore cleanup errors
		}
	}
}
```

**Key Features**:

- File-based buffering to `~/.config/agentuity/streams/{id}.tmp`
- Avoids memory pressure for large streams
- `getReader()` reads from finalized DB data
- Optional gzip compression support
- Metadata filtering in `list()` with JSON LIKE queries
- Public URL generation
- Automatic temp file cleanup after persist

### 6. Vector Storage (`vector.ts`)

```typescript
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
} from '@agentuity/core';
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

			const id = crypto.randomUUID();
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
				documentText,
				metadata,
				timestamp,
				timestamp
			);

			results.push({ key: doc.key, id });
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

		// Generate query embedding
		const queryEmbedding = simpleEmbedding(params.query);

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
}
```

**Key Features**:

- Auto-generates embeddings from document text using `simpleEmbedding()`
- Brute-force similarity search (acceptable for local dev)
- Metadata filtering with deep equality check
- `exists()` checks for any vectors in the named storage

### 7. HTTP Router (`_router.ts`)

```typescript
import type { Database } from 'bun:sqlite';
import { createRouter } from '../../router';

export function createLocalStorageRouter(db: Database, projectPath: string) {
	const router = createRouter();

	// Serve objects: GET /_agentuity/local/object/:bucket/:key
	router.get('/_agentuity/local/object/:bucket/:key', async (c) => {
		const bucket = c.req.param('bucket');
		const key = c.req.param('key');

		const query = db.query(`
      SELECT data, content_type, content_encoding, cache_control, 
             content_disposition, content_language 
      FROM object_storage 
      WHERE project_path = ? AND bucket = ? AND key = ?
    `);

		const row = query.get(projectPath, bucket, key) as {
			data: Buffer;
			content_type: string;
			content_encoding: string | null;
			cache_control: string | null;
			content_disposition: string | null;
			content_language: string | null;
		} | null;

		if (!row) {
			return c.notFound();
		}

		// Set headers
		const headers: Record<string, string> = {
			'Content-Type': row.content_type,
		};

		if (row.content_encoding) {
			headers['Content-Encoding'] = row.content_encoding;
		}
		if (row.cache_control) {
			headers['Cache-Control'] = row.cache_control;
		}
		if (row.content_disposition) {
			headers['Content-Disposition'] = row.content_disposition;
		}
		if (row.content_language) {
			headers['Content-Language'] = row.content_language;
		}

		return c.body(row.data, 200, headers);
	});

	// Serve streams: GET /_agentuity/local/stream/:id
	router.get('/_agentuity/local/stream/:id', async (c) => {
		const id = c.req.param('id');

		const query = db.query(`
      SELECT data, content_type 
      FROM stream_storage 
      WHERE project_path = ? AND id = ?
    `);

		const row = query.get(projectPath, id) as {
			data: Buffer | null;
			content_type: string;
		} | null;

		if (!row) {
			return c.notFound();
		}

		if (!row.data) {
			return c.json({ error: 'Stream not finalized' }, 400);
		}

		return c.body(row.data, 200, {
			'Content-Type': row.content_type,
		});
	});

	return router;
}
```

**Key Features**:

- Serves object storage files with all HTTP headers
- Serves stream storage files
- Returns 404 for missing objects/streams
- Returns 400 for streams not yet finalized

### 8. Public Exports (`index.ts`)

```typescript
export { getLocalDB, closeLocalDB } from './_db';
export { normalizeProjectPath, simpleEmbedding, cosineSimilarity } from './_util';
export { createLocalStorageRouter } from './_router';
export { LocalKeyValueStorage } from './keyvalue';
export { LocalObjectStorage } from './objectstore';
export { LocalStreamStorage } from './stream';
export { LocalVectorStorage } from './vector';
```

---

## Integration

### 1. Update AppConfig Interface

**File**: `packages/runtime/src/app.ts`

Add new config option:

```typescript
export interface AppConfig {
	// ... existing fields
	services?: {
		useLocal?: boolean;
		keyvalue?: KeyValueStorage;
		object?: ObjectStorage;
		stream?: StreamStorage;
		vector?: VectorStorage;
	};
}
```

### 2. Update Service Creation

**File**: `packages/runtime/src/_services.ts`

```typescript
import {
	LocalKeyValueStorage,
	LocalObjectStorage,
	LocalStreamStorage,
	LocalVectorStorage,
	getLocalDB,
	normalizeProjectPath,
	createLocalStorageRouter,
} from './services/local';
import type { Hono } from 'hono';

let localRouter: Hono | null = null;

export function createServices(config?: AppConfig, serverUrl?: string) {
	const authenticated = isAuthenticated();
	const useLocal = config?.services?.useLocal ?? false;

	if (useLocal) {
		const db = getLocalDB();
		const projectPath = normalizeProjectPath();

		if (!serverUrl) {
			throw new Error('serverUrl is required when using local services');
		}

		kv = config?.services?.keyvalue || new LocalKeyValueStorage(db, projectPath);
		objectStore = config?.services?.object || new LocalObjectStorage(db, projectPath, serverUrl);
		stream = config?.services?.stream || new LocalStreamStorage(db, projectPath, serverUrl);
		vector = config?.services?.vector || new LocalVectorStorage(db, projectPath);

		localRouter = createLocalStorageRouter(db, projectPath);

		return { localRouter };
	}

	// Reset local router if not using local services
	localRouter = null;

	// ... existing authentication logic
	if (config?.services?.keyvalue) {
		kv = config.services.keyvalue;
	} else if (authenticated) {
		kv = new KeyValueStorageService(kvBaseUrl, adapter);
	} else {
		kv = new UnauthenticatedKeyValueStorage();
	}

	// ... similar for other services

	return {};
}

export function getLocalRouter(): Hono | null {
	return localRouter;
}
```

### 3. Update App Creation

**File**: `packages/runtime/src/app.ts`

```typescript
export function createApp(config?: AppConfig) {
	// ... existing setup

	const server = createServer(config);

	// Create services with server URL
	const servicesResult = createServices(config, server.url.toString());

	// ... existing app setup

	// Mount local router if present
	if (servicesResult?.localRouter) {
		app.route('/', servicesResult.localRouter);
	}

	// ... rest of setup

	return { app, server, logger };
}
```

### 4. Update Unauth App

**File**: `apps/testing/unauth-app/app.ts`

```typescript
import { createApp } from '@agentuity/runtime';
import { showRoutes } from 'hono/dev';

// No need to specify useLocal - it's automatic when unauthenticated
const { app, server, logger } = createApp();

showRoutes(app);

logger.info('Running with local SQLite services at %s', server.url);
logger.info('Database location: ~/.config/agentuity/local.db');
```

**Note**: The `useLocal: true` config is no longer needed. Local services are automatically used when `AGENTUITY_SDK_KEY` is not set.

---

## Testing Strategy

### Unit Tests

**File**: `packages/runtime/src/services/local/__test__/keyvalue.test.ts`

```typescript
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { LocalKeyValueStorage } from '../keyvalue';
import { initializeTables } from '../_db';

describe('LocalKeyValueStorage', () => {
	let db: Database;
	let kv: LocalKeyValueStorage;

	beforeEach(() => {
		db = new Database(':memory:');
		initializeTables(db);
		kv = new LocalKeyValueStorage(db, '/test/project');
	});

	afterEach(() => {
		db.close();
	});

	test('set and get string value', async () => {
		await kv.set('test', 'key1', 'value1');
		const result = await kv.get('test', 'key1');

		expect(result.exists).toBe(true);
		if (result.exists) {
			expect(result.data).toBe('value1');
			expect(result.contentType).toBe('text/plain');
		}
	});

	test('get non-existent key', async () => {
		const result = await kv.get('test', 'missing');
		expect(result.exists).toBe(false);
	});

	test('TTL expiration', async () => {
		await kv.set('test', 'key1', 'value1', { ttl: 60 });
		// Would need to mock time or wait for expiration
	});

	// ... more tests
});
```

Similar test files for:

- `objectstore.test.ts`
- `stream.test.ts`
- `vector.test.ts`
- `_util.test.ts` (test embedding and similarity functions)

### Integration Tests

**File**: `apps/testing/unauth-app/test.ts`

Update to test all 4 services:

```typescript
// Test KeyValue
await ctx.kv.set('test', 'key1', { hello: 'world' });
const kvResult = await ctx.kv.get('test', 'key1');
console.log('KV:', kvResult);

// Test ObjectStore
const data = new TextEncoder().encode('test object');
await ctx.objectstore.put('bucket1', 'file.txt', data);
const objResult = await ctx.objectstore.get('bucket1', 'file.txt');
console.log('Object:', objResult);

// Test Stream
const stream = await ctx.stream.create('test-stream');
await stream.write('chunk 1');
await stream.write('chunk 2');
await stream.close();
console.log('Stream URL:', stream.url);

// Test Vector
await ctx.vector.upsert('docs', { key: 'doc1', document: 'hello world' });
const searchResults = await ctx.vector.search('docs', { query: 'world' });
console.log('Vector search:', searchResults);
```

---

## Implementation Checklist

### Phase 1: Foundation

- [ ] Create `packages/runtime/src/services/local/` directory
- [ ] Implement `_db.ts` with singleton and schema initialization
- [ ] Implement `_util.ts` with path normalization and embedding functions
- [ ] Add unit tests for utilities

### Phase 2: Service Implementations

- [ ] Implement `LocalKeyValueStorage` in `keyvalue.ts`
- [ ] Add unit tests for KeyValue service
- [ ] Implement `LocalObjectStorage` in `objectstore.ts`
- [ ] Add unit tests for ObjectStorage service
- [ ] Implement `LocalStreamStorage` in `stream.ts`
- [ ] Add unit tests for Stream service
- [ ] Implement `LocalVectorStorage` in `vector.ts`
- [ ] Add unit tests for Vector service

### Phase 3: HTTP Router

- [ ] Implement `_router.ts` with object and stream endpoints
- [ ] Test router endpoints manually

### Phase 4: Integration

- [ ] Update `AppConfig` interface in `app.ts`
- [ ] Update `_services.ts` to support `useLocal` option
- [ ] Update `createApp()` to mount local router
- [ ] Create `index.ts` with public exports

### Phase 5: Testing & Documentation

- [ ] Update `apps/testing/unauth-app/app.ts` to use local services
- [ ] Update `apps/testing/unauth-app/test.ts` to test all services
- [ ] Run `bun run test` in unauth-app and verify all services work
- [ ] Add AGENTS.md notes about local services
- [ ] Update package README if needed

### Phase 6: Validation

- [ ] Run `bun run build` to ensure TypeScript compiles
- [ ] Run `bun run typecheck` to verify types
- [ ] Run all tests: `bun run test`
- [ ] Manual testing of unauth-app
- [ ] Verify SQLite DB created at `~/.config/agentuity/local.db`

---

## Open Questions

1. **Error Handling**: Should we add more detailed error messages or logging?
2. **Cleanup**: Should we add a CLI command to clear the local DB?
3. **Migration**: Do we need schema versioning for future updates?
4. **Performance**: Should we add indexes for common queries?
5. **Expiration**: Should we implement background cleanup for expired KV entries?

---

## Implemented Features

✅ **Automatic Local Services When Unauthenticated**: No configuration needed!

- Local SQLite services are **automatically used** when `AGENTUITY_SDK_KEY` is not set
- No more `UnauthenticatedError` exceptions
- Seamless development experience without authentication
- Can still be explicitly enabled with `useLocal: true` if desired

✅ **Automatic Orphaned Project Cleanup**: On DB initialization, data from projects whose directories no longer exist is automatically deleted

- Queries all tables for unique `project_path` values
- Checks filesystem to verify directory still exists
- Excludes current project from cleanup
- Deletes all orphaned data in a single transaction
- Logs cleanup activity for visibility

## Future Enhancements

- Add SQLite VACUUM on cleanup
- Implement proper vector index (e.g., HNSW) instead of brute-force search
- Add metrics/telemetry for local service usage
- Support custom embedding dimensions
- Add DB migration system for schema changes
- Implement background expiration cleanup job for KV entries
- Add CLI tool for inspecting/managing local DB
