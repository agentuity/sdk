import { Database } from 'bun:sqlite';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { getDefaultConfigDir } from '../config.ts';

let db: Database | null = null;

/**
 * Get or create the database connection synchronously.
 * Reuses the existing resource.db file for consistency.
 */
function getDatabase(): Database {
	if (db) return db;

	const configDir = getDefaultConfigDir();
	mkdirSync(configDir, { recursive: true });

	db = new Database(join(configDir, 'resource.db'));
	db.run(`
		CREATE TABLE IF NOT EXISTS agent_intro_seen (
			agent_id TEXT PRIMARY KEY,
			first_seen_at INTEGER NOT NULL
		)
	`);
	return db;
}

/**
 * Check if an agent has already seen the intro message.
 * This is a synchronous operation for use in formatHelp.
 * Returns true on error to avoid blocking CLI (assumes seen).
 */
export function hasAgentSeenIntro(agentId: string): boolean {
	try {
		const row = getDatabase()
			.query<{ agent_id: string }, [string]>(
				'SELECT agent_id FROM agent_intro_seen WHERE agent_id = ?'
			)
			.get(agentId);
		return row !== null;
	} catch {
		// Assume seen on error to avoid blocking CLI
		return true;
	}
}

/**
 * Mark an agent as having seen the intro message.
 * This is a synchronous operation for use in formatHelp.
 * Silently fails on error (non-critical feature).
 */
export function markAgentIntroSeen(agentId: string): void {
	try {
		getDatabase().run(
			'INSERT OR IGNORE INTO agent_intro_seen (agent_id, first_seen_at) VALUES (?, ?)',
			[agentId, Date.now()]
		);
	} catch {
		// Non-critical - intro tracking failure shouldn't block CLI
	}
}

/**
 * Ensure the agent_input_hint_seen table exists.
 * Called lazily on first hint check.
 */
let hintTableCreated = false;
function ensureHintTable(): void {
	if (hintTableCreated) return;
	try {
		getDatabase().run(`
			CREATE TABLE IF NOT EXISTS agent_input_hint_seen (
				agent_id TEXT PRIMARY KEY,
				first_seen_at INTEGER NOT NULL
			)
		`);
		hintTableCreated = true;
	} catch {
		// Non-critical
	}
}

/**
 * Check if an agent has already seen the structured input hint.
 * Returns true on error to avoid blocking CLI (assumes seen).
 */
export function hasAgentSeenInputHint(agentId: string): boolean {
	try {
		ensureHintTable();
		const row = getDatabase()
			.query<{ agent_id: string }, [string]>(
				'SELECT agent_id FROM agent_input_hint_seen WHERE agent_id = ?'
			)
			.get(agentId);
		return row !== null;
	} catch {
		return true;
	}
}

/**
 * Mark an agent as having seen the structured input hint.
 * Silently fails on error (non-critical feature).
 */
export function markAgentInputHintSeen(agentId: string): void {
	try {
		ensureHintTable();
		getDatabase().run(
			'INSERT OR IGNORE INTO agent_input_hint_seen (agent_id, first_seen_at) VALUES (?, ?)',
			[agentId, Date.now()]
		);
	} catch {
		// Non-critical
	}
}
