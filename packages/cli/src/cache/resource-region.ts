import { Database } from 'bun:sqlite';
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { getDefaultConfigDir } from '../config';

const TTL_DAYS = 7;
const TTL_MS = TTL_DAYS * 24 * 60 * 60 * 1000;

let db: Database | null = null;

async function getDatabase(): Promise<Database> {
	if (db) {
		return db;
	}

	const configDir = getDefaultConfigDir();
	await mkdir(configDir, { recursive: true });

	const dbPath = join(configDir, 'resource.db');
	db = new Database(dbPath);

	db.run(`
		CREATE TABLE IF NOT EXISTS resource_region_cache (
			resource_type TEXT NOT NULL,
			profile TEXT NOT NULL,
			id TEXT NOT NULL,
			region TEXT NOT NULL,
			last_updated INTEGER NOT NULL,
			PRIMARY KEY (resource_type, profile, id)
		)
	`);

	db.run(`
		CREATE INDEX IF NOT EXISTS idx_last_updated 
		ON resource_region_cache(last_updated)
	`);

	return db;
}

function pruneOldEntries(database: Database): void {
	const cutoff = Date.now() - TTL_MS;
	database.run('DELETE FROM resource_region_cache WHERE last_updated < ?', [cutoff]);
}

export type ResourceType = 'sandbox' | 'bucket' | 'db' | 'project';

/**
 * Get the cached region for a resource.
 * Returns null if not found or expired.
 */
export async function getResourceRegion(
	type: ResourceType,
	profile: string,
	id: string
): Promise<string | null> {
	const database = await getDatabase();

	pruneOldEntries(database);

	const row = database
		.query<{ region: string }, [string, string, string]>(
			'SELECT region FROM resource_region_cache WHERE resource_type = ? AND profile = ? AND id = ?'
		)
		.get(type, profile, id);

	return row?.region ?? null;
}

/**
 * Set the cached region for a resource.
 * Uses INSERT OR REPLACE to upsert.
 */
export async function setResourceRegion(
	type: ResourceType,
	profile: string,
	id: string,
	region: string
): Promise<void> {
	const database = await getDatabase();

	database.run(
		`INSERT OR REPLACE INTO resource_region_cache 
		 (resource_type, profile, id, region, last_updated)
		 VALUES (?, ?, ?, ?, ?)`,
		[type, profile, id, region, Date.now()]
	);
}

/**
 * Delete the cached region for a resource.
 * Called when a resource is deleted.
 */
export async function deleteResourceRegion(
	type: ResourceType,
	profile: string,
	id: string
): Promise<void> {
	const database = await getDatabase();

	database.run(
		'DELETE FROM resource_region_cache WHERE resource_type = ? AND profile = ? AND id = ?',
		[type, profile, id]
	);
}

/**
 * Clear all cached entries for a specific profile.
 * Useful when switching profiles or logging out.
 */
export async function clearProfileCache(profile: string): Promise<void> {
	const database = await getDatabase();

	database.run('DELETE FROM resource_region_cache WHERE profile = ?', [profile]);
}

/**
 * Close the database connection.
 * Should be called on CLI exit for clean shutdown.
 */
export function closeDatabase(): void {
	if (db) {
		db.close();
		db = null;
	}
}
