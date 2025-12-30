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

		// Try to restore state from DB
		const row = this.db
			.query<{ state: string }, [string]>('SELECT state FROM threads WHERE id = ?')
			.get(threadId);

		// Parse the stored data, handling both old (flat) and new ({ state, metadata }) formats
		const { flatStateJson, metadata } = parseThreadData(row?.state);

		// Create thread with restored state and metadata
		const thread = new DefaultThread(this, threadId, flatStateJson, metadata);

		// Populate thread state from restored data
		if (flatStateJson) {
			try {
				const data = JSON.parse(flatStateJson);
				for (const [key, value] of Object.entries(data)) {
					thread.state.set(key, value);
				}
			} catch {
				// Continue with empty state if parsing fails
			}
		}

		return thread;
	}

	async save(thread: Thread): Promise<void> {
		if (!this.db || !(thread instanceof DefaultThread)) {
			return;
		}

		// Only save if state was modified
		if (!thread.isDirty()) {
			return;
		}

		const stateJson = thread.getSerializedState();
		const now = Date.now();

		// Upsert thread state
		this.db.run(
			`INSERT INTO threads (id, state, updated_at) VALUES (?, ?, ?)
			 ON CONFLICT(id) DO UPDATE SET state = ?, updated_at = ?`,
			[thread.id, stateJson, now, stateJson, now]
		);
	}

	async destroy(thread: Thread): Promise<void> {
		if (!this.db) {
			return;
		}

		// Delete thread from DB
		this.db.run('DELETE FROM threads WHERE id = ?', [thread.id]);
	}
}
