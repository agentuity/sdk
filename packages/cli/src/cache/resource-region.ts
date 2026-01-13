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
			org_id TEXT,
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
 * Resource info returned from cache lookup
 */
export interface ResourceInfo {
	region: string;
	orgId?: string;
}

/**
 * Get the cached info (region and orgId) for a resource.
 * Returns null if not found or expired.
 */
export async function getResourceInfo(
	type: ResourceType,
	profile: string,
	id: string
): Promise<ResourceInfo | null> {
	const database = await getDatabase();

	pruneOldEntries(database);

	const row = database
		.query<
			{ region: string; org_id: string | null },
			[string, string, string]
		>('SELECT region, org_id FROM resource_region_cache WHERE resource_type = ? AND profile = ? AND id = ?')
		.get(type, profile, id);

	if (!row) {
		return null;
	}

	return {
		region: row.region,
		orgId: row.org_id ?? undefined,
	};
}

/**
 * Get the cached region for a resource.
 * Returns null if not found or expired.
 * @deprecated Use getResourceInfo() to get both region and orgId
 */
export async function getResourceRegion(
	type: ResourceType,
	profile: string,
	id: string
): Promise<string | null> {
	const info = await getResourceInfo(type, profile, id);
	return info?.region ?? null;
}

/**
 * Set the cached info for a resource.
 * Uses INSERT OR REPLACE to upsert.
 */
export async function setResourceInfo(
	type: ResourceType,
	profile: string,
	id: string,
	region: string,
	orgId?: string
): Promise<void> {
	const database = await getDatabase();

	database.run(
		`INSERT OR REPLACE INTO resource_region_cache 
		 (resource_type, profile, id, region, org_id, last_updated)
		 VALUES (?, ?, ?, ?, ?, ?)`,
		[type, profile, id, region, orgId ?? null, Date.now()]
	);
}

/**
 * Set the cached region for a resource.
 * Uses INSERT OR REPLACE to upsert.
 * @deprecated Use setResourceInfo() to set both region and orgId
 */
export async function setResourceRegion(
	type: ResourceType,
	profile: string,
	id: string,
	region: string
): Promise<void> {
	await setResourceInfo(type, profile, id, region);
}

/**
 * Delete the cached info for a resource.
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
