import type { Database } from 'bun:sqlite';
import type {
	QueueService,
	QueuePublishParams,
	QueuePublishResult,
	QueueCreateParams,
	QueueCreateResult,
} from '@agentuity/core';

export class LocalQueueStorage implements QueueService {
	#db: Database;
	#projectPath: string;

	constructor(db: Database, projectPath: string) {
		this.#db = db;
		this.#projectPath = projectPath;
		this.#initializeTable();
	}

	#initializeTable(): void {
		this.#db.run(`
			CREATE TABLE IF NOT EXISTS queue_messages (
				id TEXT PRIMARY KEY,
				project_path TEXT NOT NULL,
				queue_name TEXT NOT NULL,
				offset INTEGER NOT NULL,
				payload TEXT NOT NULL,
				metadata TEXT,
				partition_key TEXT,
				idempotency_key TEXT,
				ttl_seconds INTEGER,
				expires_at TEXT,
				state TEXT NOT NULL DEFAULT 'pending',
				created_at TEXT NOT NULL,
				published_at TEXT NOT NULL
			)
		`);

		this.#db.run(`
			CREATE INDEX IF NOT EXISTS idx_queue_name 
			ON queue_messages(project_path, queue_name)
		`);

		this.#db.run(`
			CREATE UNIQUE INDEX IF NOT EXISTS idx_queue_idempotency_unique
			ON queue_messages(project_path, queue_name, idempotency_key)
			WHERE idempotency_key IS NOT NULL
		`);
	}

	async publish(
		queueName: string,
		payload: string | object,
		params?: QueuePublishParams
	): Promise<QueuePublishResult> {
		const id = crypto.randomUUID();
		const timestamp = new Date().toISOString();
		const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
		const metadataStr = params?.metadata ? JSON.stringify(params.metadata) : null;
		const ttlSeconds = params?.ttl ?? null;
		const expiresAt = ttlSeconds ? new Date(Date.now() + ttlSeconds * 1000).toISOString() : null;

		const publishInTransaction = this.#db.transaction(() => {
			if (params?.idempotencyKey) {
				const existing = this.#db
					.query(
						`
					SELECT id, offset, published_at 
					FROM queue_messages 
					WHERE project_path = ? AND queue_name = ? AND idempotency_key = ?
				`
					)
					.get(this.#projectPath, queueName, params.idempotencyKey) as {
					id: string;
					offset: number;
					published_at: string;
				} | null;

				if (existing) {
					return {
						id: existing.id,
						offset: existing.offset,
						publishedAt: existing.published_at,
					};
				}
			}

			const offsetResult = this.#db
				.query(
					`
				SELECT COALESCE(MAX(offset), -1) + 1 as next_offset 
				FROM queue_messages 
				WHERE project_path = ? AND queue_name = ?
			`
				)
				.get(this.#projectPath, queueName) as { next_offset: number };

			const offset = offsetResult.next_offset;

			this.#db
				.prepare(
					`
				INSERT INTO queue_messages (
					id, project_path, queue_name, offset, payload, metadata, 
					partition_key, idempotency_key, ttl_seconds, expires_at, state, created_at, published_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
			`
				)
				.run(
					id,
					this.#projectPath,
					queueName,
					offset,
					payloadStr,
					metadataStr,
					params?.partitionKey ?? null,
					params?.idempotencyKey ?? null,
					ttlSeconds,
					expiresAt,
					timestamp,
					timestamp
				);

			return {
				id,
				offset,
				publishedAt: timestamp,
			};
		});

		return publishInTransaction.immediate();
	}

	async createQueue(queueName: string, params?: QueueCreateParams): Promise<QueueCreateResult> {
		console.debug(`[local] createQueue: ${queueName}`);
		return {
			name: queueName,
			queueType: params?.queueType ?? 'worker',
		};
	}

	async deleteQueue(_queueName: string): Promise<void> {
		// No-op in local mode — queues don't need provisioning locally
	}
}
