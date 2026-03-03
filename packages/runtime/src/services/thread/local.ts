import type { Context } from 'hono';
import type { Database } from 'bun:sqlite';
import type { AppState } from '../../index';
import type { Env } from '../../app';
import {
	DefaultThread,
	DefaultThreadIDProvider,
	parseThreadData,
	validateThreadIdOrThrow,
	type Thread,
	type ThreadIDProvider,
	type ThreadProvider,
} from '../../session';
import { getLocalDB } from '../local/_db';

/**
 * Local thread provider with SQLite persistence.
 * Stores thread state in local DB for development and testing.
 * Suitable for local development and testing with persistence across requests.
 */
export class LocalThreadProvider implements ThreadProvider {
	private appState: AppState | null = null;
	private threadIDProvider: ThreadIDProvider = new DefaultThreadIDProvider();
	private db: Database | null = null;

	async initialize(appState: AppState): Promise<void> {
		this.appState = appState;
		this.db = getLocalDB();

		// Create threads table if it doesn't exist
		this.db.run(`
			CREATE TABLE IF NOT EXISTS threads (
				id TEXT PRIMARY KEY,
				state TEXT NOT NULL,
				updated_at INTEGER NOT NULL
			)
		`);
	}

	setThreadIDProvider(provider: ThreadIDProvider): void {
		this.threadIDProvider = provider;
	}

	async restore(ctx: Context<Env>): Promise<Thread> {
		if (this.appState === null || this.db === null) {
			throw new Error(
				'LocalThreadProvider.restore called before initialize(): appState/db not set; call initialize(appState) first'
			);
		}

		const threadId = await this.threadIDProvider.getThreadId(this.appState, ctx);
		validateThreadIdOrThrow(threadId);

		// Create a restore function for lazy loading
		const restoreFn = async (): Promise<{
			state: Map<string, unknown>;
			metadata: Record<string, unknown>;
		}> => {
			if (!this.db) {
				return { state: new Map(), metadata: {} };
			}

			const row = this.db
				.query<{ state: string }, [string]>('SELECT state FROM threads WHERE id = ?')
				.get(threadId);

			const { flatStateJson, metadata } = parseThreadData(row?.state);

			const state = new Map<string, unknown>();
			if (flatStateJson) {
				try {
					const data = JSON.parse(flatStateJson);
					for (const [key, value] of Object.entries(data)) {
						state.set(key, value);
					}
				} catch {
					// Continue with empty state if parsing fails
				}
			}

			return { state, metadata: metadata || {} };
		};

		return new DefaultThread(this, threadId, restoreFn);
	}

	async save(thread: Thread): Promise<void> {
		if (!this.db || !(thread instanceof DefaultThread)) {
			return;
		}

		const saveMode = thread.getSaveMode();
		if (saveMode === 'none') {
			return;
		}

		const now = Date.now();

		if (saveMode === 'merge') {
			// For merge, we need to load existing state, apply operations, then save
			const operations = thread.getPendingOperations();
			const metadata = thread.getMetadataForSave();

			// Load existing state
			const row = this.db
				.query<{ state: string }, [string]>('SELECT state FROM threads WHERE id = ?')
				.get(thread.id);

			const { flatStateJson, metadata: existingMetadata } = parseThreadData(row?.state);

			const state: Record<string, unknown> = {};
			if (flatStateJson) {
				try {
					Object.assign(state, JSON.parse(flatStateJson));
				} catch {
					// Continue with empty state if parsing fails
				}
			}

			// Apply operations
			for (const op of operations) {
				switch (op.op) {
					case 'clear':
						for (const key of Object.keys(state)) {
							delete state[key];
						}
						break;
					case 'set':
						if (op.key !== undefined) {
							state[op.key] = op.value;
						}
						break;
					case 'delete':
						if (op.key !== undefined) {
							delete state[op.key];
						}
						break;
					case 'push':
						if (op.key !== undefined) {
							const existing = state[op.key];
							let arr: unknown[];
							if (Array.isArray(existing)) {
								existing.push(op.value);
								arr = existing;
							} else if (existing === undefined) {
								arr = [op.value];
								state[op.key] = arr;
							} else {
								// If non-array, silently skip
								continue;
							}
							// Apply maxRecords limit
							if (op.maxRecords !== undefined && arr.length > op.maxRecords) {
								state[op.key] = arr.slice(arr.length - op.maxRecords);
							}
						}
						break;
				}
			}

			// Build final data
			const finalMetadata = metadata || existingMetadata || {};
			const hasState = Object.keys(state).length > 0;
			const hasMetadata = Object.keys(finalMetadata).length > 0;

			let stateJson = '';
			if (hasState || hasMetadata) {
				const data: { state?: Record<string, unknown>; metadata?: Record<string, unknown> } =
					{};
				if (hasState) data.state = state;
				if (hasMetadata) data.metadata = finalMetadata;
				stateJson = JSON.stringify(data);
			}

			this.db.run(
				`INSERT INTO threads (id, state, updated_at) VALUES (?, ?, ?)
				 ON CONFLICT(id) DO UPDATE SET state = ?, updated_at = ?`,
				[thread.id, stateJson, now, stateJson, now]
			);
		} else {
			// Full save
			const stateJson = await thread.getSerializedState();
			this.db.run(
				`INSERT INTO threads (id, state, updated_at) VALUES (?, ?, ?)
				 ON CONFLICT(id) DO UPDATE SET state = ?, updated_at = ?`,
				[thread.id, stateJson, now, stateJson, now]
			);
		}
	}

	async destroy(thread: Thread): Promise<void> {
		if (!this.db) {
			return;
		}

		// Delete thread from DB
		this.db.run('DELETE FROM threads WHERE id = ?', [thread.id]);
	}
}
