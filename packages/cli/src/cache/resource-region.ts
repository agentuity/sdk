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
	db.run('PRAGMA journal_mode = WAL');
	db.run('PRAGMA busy_timeout = 5000');
	db.run('PRAGMA synchronous = NORMAL');

	db.run(`
		CREATE TABLE IF NOT EXISTS resource_region_cache (
			resource_type TEXT NOT NULL,
			profile TEXT NOT NULL,
			id TEXT NOT NULL,
			region TEXT NOT NULL,
			org_id TEXT,
			project_id TEXT,
			last_updated INTEGER NOT NULL,
			PRIMARY KEY (resource_type, profile, id)
		)
	`);

	db.run(`
		CREATE INDEX IF NOT EXISTS idx_last_updated 
		ON resource_region_cache(last_updated)
	`);

	// Migration: Add project_id column if it doesn't exist (for existing databases)
	try {
		db.run('ALTER TABLE resource_region_cache ADD COLUMN project_id TEXT');
	} catch {
		// Column already exists, ignore the error
	}

	return db;
}

function pruneOldEntries(database: Database): void {
	const cutoff = Date.now() - TTL_MS;
	database.run('DELETE FROM resource_region_cache WHERE last_updated < ?', [cutoff]);
}

export type ResourceType =
	| 'sandbox'
	| 'bucket'
	| 'db'
	| 'project'
	| 'deployment'
	| 'machine'
	| 'queue'
	| 'vector'
	| 'kv'
	| 'stream'
	| 'email'
	| 'webhook'
	| 'task';

/**
 * Resource info returned from cache lookup
 */
export interface ResourceInfo {
	region: string;
	orgId?: string;
	projectId?: string;
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
	try {
		const database = await getDatabase();
		const cutoff = Date.now() - TTL_MS;

		const row = database
			.query<
				{
					region: string;
					org_id: string | null;
					project_id: string | null;
					last_updated: number;
				},
				[string, string, string]
			>(
				'SELECT region, org_id, project_id, last_updated FROM resource_region_cache WHERE resource_type = ? AND profile = ? AND id = ?'
			)
			.get(type, profile, id);

		if (!row) {
			return null;
		}

		// Check if entry is expired
		if (row.last_updated < cutoff) {
			// Remove stale entry
			database.run(
				'DELETE FROM resource_region_cache WHERE resource_type = ? AND profile = ? AND id = ?',
				[type, profile, id]
			);
			return null;
		}

		return {
			region: row.region,
			orgId: row.org_id ?? undefined,
			projectId: row.project_id ?? undefined,
		};
	} catch {
		return null;
	}
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
	orgId?: string,
	projectId?: string
): Promise<void> {
	try {
		const database = await getDatabase();

		pruneOldEntries(database);

		database.run(
			`INSERT OR REPLACE INTO resource_region_cache 
			 (resource_type, profile, id, region, org_id, project_id, last_updated)
			 VALUES (?, ?, ?, ?, ?, ?, ?)`,
			[type, profile, id, region, orgId ?? null, projectId ?? null, Date.now()]
		);
	} catch {
		// Non-critical cache failure should never block the CLI.
	}
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
	try {
		const database = await getDatabase();

		database.run(
			'DELETE FROM resource_region_cache WHERE resource_type = ? AND profile = ? AND id = ?',
			[type, profile, id]
		);
	} catch {
		// Non-critical cache failure should never block the CLI.
	}
}

/**
 * Clear all cached entries for a specific profile.
 * Useful when switching profiles or logging out.
 */
export async function clearProfileCache(profile: string): Promise<void> {
	try {
		const database = await getDatabase();

		database.run('DELETE FROM resource_region_cache WHERE profile = ?', [profile]);
	} catch {
		// Non-critical cache failure should never block the CLI.
	}
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
