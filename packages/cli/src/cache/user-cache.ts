import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { getDefaultConfigDir } from '../config.ts';
import { type Database, openDatabase } from '../node-compat/sqlite.ts';

let db: Database | null = null;

/**
 * Get or create the database connection. Reuses the existing
 * `resource.db` file for consistency with the other cache tables.
 */
async function getDatabase(): Promise<Database> {
	if (db) return db;

	const configDir = getDefaultConfigDir();
	await mkdir(configDir, { recursive: true });

	db = await openDatabase(join(configDir, 'resource.db'));
	db.exec(`
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

interface UserInfoRow {
	user_id: string;
	first_name: string;
	last_name: string;
}

/**
 * Get cached user info for a profile.
 * Returns null if not found in cache.
 */
export async function getCachedUserInfo(
	profile: string
): Promise<{ userId: string; firstName: string; lastName: string } | null> {
	try {
		const row = (await getDatabase())
			.prepare('SELECT user_id, first_name, last_name FROM user_info_cache WHERE profile = ?')
			.get<UserInfoRow>(profile);
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
export async function setCachedUserInfo(
	profile: string,
	userId: string,
	firstName: string,
	lastName: string
): Promise<void> {
	try {
		(await getDatabase())
			.prepare(
				`INSERT INTO user_info_cache (profile, user_id, first_name, last_name, cached_at)
			 VALUES (?, ?, ?, ?, ?)
			 ON CONFLICT(profile) DO UPDATE SET
				user_id = excluded.user_id,
				first_name = excluded.first_name,
				last_name = excluded.last_name,
				cached_at = excluded.cached_at`
			)
			.run(profile, userId, firstName, lastName, Date.now());
	} catch {
		// Non-critical — caching failure shouldn't block CLI
	}
}

/**
 * Clear cached user info for a profile.
 * Called on logout to ensure stale data is removed.
 */
export async function clearCachedUserInfo(profile: string): Promise<void> {
	try {
		(await getDatabase()).prepare('DELETE FROM user_info_cache WHERE profile = ?').run(profile);
	} catch {
		// Non-critical — cache cleanup failure shouldn't block logout
	}
}
