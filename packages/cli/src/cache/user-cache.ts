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
		CREATE TABLE IF NOT EXISTS user_info_cache (
			profile TEXT PRIMARY KEY,
			user_id TEXT NOT NULL,
			first_name TEXT NOT NULL,
			last_name TEXT NOT NULL,
			cached_at INTEGER NOT NULL
		)
	`);
	return db;
}

/**
 * Get cached user info for a profile.
 * Returns null if not found in cache.
 */
export function getCachedUserInfo(
	profile: string
): { userId: string; firstName: string; lastName: string } | null {
	try {
		const row = getDatabase()
			.query<{ user_id: string; first_name: string; last_name: string }, [string]>(
				'SELECT user_id, first_name, last_name FROM user_info_cache WHERE profile = ?'
			)
			.get(profile);
		if (!row) return null;
		return {
			userId: row.user_id,
			firstName: row.first_name,
			lastName: row.last_name,
		};
	} catch {
		// Non-critical — return null on error
		return null;
	}
}

/**
 * Cache user info for a profile.
 * Upserts the entry so repeated calls are safe.
 */
export function setCachedUserInfo(
	profile: string,
	userId: string,
	firstName: string,
	lastName: string
): void {
	try {
		getDatabase().run(
			`INSERT INTO user_info_cache (profile, user_id, first_name, last_name, cached_at)
			 VALUES (?, ?, ?, ?, ?)
			 ON CONFLICT(profile) DO UPDATE SET
				user_id = excluded.user_id,
				first_name = excluded.first_name,
				last_name = excluded.last_name,
				cached_at = excluded.cached_at`,
			[profile, userId, firstName, lastName, Date.now()]
		);
	} catch {
		// Non-critical — caching failure shouldn't block CLI
	}
}

/**
 * Clear cached user info for a profile.
 * Called on logout to ensure stale data is removed.
 */
export function clearCachedUserInfo(profile: string): void {
	try {
		getDatabase().run('DELETE FROM user_info_cache WHERE profile = ?', [profile]);
	} catch {
		// Non-critical — cache cleanup failure shouldn't block logout
	}
}
