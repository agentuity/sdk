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
import { randomUUID } from 'node:crypto';
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

		const id = randomUUID();
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
		const queryParams: (string | number)[] = [this.#projectPath];

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

	async get(id: string): Promise<StreamInfo> {
		if (!id?.trim()) {
			throw new Error('Stream id is required');
		}

		const stmt = this.#db.query<
			{ id: string; name: string; metadata: string | null; size_bytes: number },
			[string, string]
		>(`
			SELECT id, name, metadata, size_bytes
			FROM stream_storage
			WHERE project_path = ? AND id = ?
		`);

		const row = stmt.get(this.#projectPath, id);

		if (!row) {
			throw new Error(`Stream not found: ${id}`);
		}

		const metadata = row.metadata ? JSON.parse(row.metadata) : {};
		const url = `${this.#serverUrl}/_agentuity/local/stream/${id}`;

		return {
			id: row.id,
			name: row.name,
			metadata,
			url,
			sizeBytes: row.size_bytes,
		};
	}

	async download(id: string): Promise<ReadableStream<Uint8Array>> {
		if (!id?.trim()) {
			throw new Error('Stream id is required');
		}

		const stmt = this.#db.query<{ data: Buffer | null }, [string, string]>(`
			SELECT data FROM stream_storage
			WHERE project_path = ? AND id = ?
		`);

		const row = stmt.get(this.#projectPath, id);

		if (!row || !row.data) {
			throw new Error(`Stream not found or empty: ${id}`);
		}

		// Convert Buffer to ReadableStream
		const buffer = row.data;
		return new ReadableStream({
			start(controller) {
				controller.enqueue(new Uint8Array(buffer));
				controller.close();
			},
		});
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

	override async close(): Promise<void> {
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
		} catch {
			// Ignore cleanup errors
		}
	}
}
