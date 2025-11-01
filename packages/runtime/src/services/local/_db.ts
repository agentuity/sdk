import { Database } from 'bun:sqlite';
import { mkdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

let dbInstance: Database | null = null;

export function getLocalDB(): Database {
	if (dbInstance) {
		return dbInstance;
	}

	const configDir = join(homedir(), '.config', 'agentuity');

	if (!existsSync(configDir)) {
		mkdirSync(configDir, { recursive: true });
	}

	const dbPath = join(configDir, 'local.db');
	dbInstance = new Database(dbPath);

	initializeTables(dbInstance);
	cleanupOrphanedProjects(dbInstance);

	return dbInstance;
}

function initializeTables(db: Database): void {
	// KeyValue Storage table
	db.run(`
		CREATE TABLE IF NOT EXISTS kv_storage (
			project_path TEXT NOT NULL,
			name TEXT NOT NULL,
			key TEXT NOT NULL,
			value BLOB NOT NULL,
			content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
			expires_at INTEGER,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL,
			PRIMARY KEY (project_path, name, key)
		)
	`);

	db.run(`
		CREATE INDEX IF NOT EXISTS idx_kv_expires 
		ON kv_storage(expires_at) 
		WHERE expires_at IS NOT NULL
	`);

	// Object Storage table
	db.run(`
		CREATE TABLE IF NOT EXISTS object_storage (
			project_path TEXT NOT NULL,
			bucket TEXT NOT NULL,
			key TEXT NOT NULL,
			data BLOB NOT NULL,
			content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
			content_encoding TEXT,
			cache_control TEXT,
			content_disposition TEXT,
			content_language TEXT,
			metadata TEXT,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL,
			PRIMARY KEY (project_path, bucket, key)
		)
	`);

	// Stream Storage table
	db.run(`
		CREATE TABLE IF NOT EXISTS stream_storage (
			project_path TEXT NOT NULL,
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			metadata TEXT,
			content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
			data BLOB,
			size_bytes INTEGER NOT NULL DEFAULT 0,
			created_at INTEGER NOT NULL
		)
	`);

	db.run(`
		CREATE INDEX IF NOT EXISTS idx_stream_name 
		ON stream_storage(project_path, name)
	`);

	db.run(`
		CREATE INDEX IF NOT EXISTS idx_stream_metadata 
		ON stream_storage(metadata)
	`);

	// Vector Storage table
	db.run(`
		CREATE TABLE IF NOT EXISTS vector_storage (
			project_path TEXT NOT NULL,
			name TEXT NOT NULL,
			id TEXT PRIMARY KEY,
			key TEXT NOT NULL,
			embedding TEXT NOT NULL,
			document TEXT,
			metadata TEXT,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL,
			UNIQUE (project_path, name, key)
		)
	`);

	db.run(`
		CREATE INDEX IF NOT EXISTS idx_vector_lookup 
		ON vector_storage(project_path, name, key)
	`);

	db.run(`
		CREATE INDEX IF NOT EXISTS idx_vector_name 
		ON vector_storage(project_path, name)
	`);
}

function cleanupOrphanedProjects(db: Database): void {
	// Get the current project path to exclude from cleanup
	const currentProjectPath = process.cwd();

	// Query all tables for unique project paths
	const kvPaths = db.query('SELECT DISTINCT project_path FROM kv_storage').all() as Array<{
		project_path: string;
	}>;
	const objectPaths = db.query('SELECT DISTINCT project_path FROM object_storage').all() as Array<{
		project_path: string;
	}>;
	const streamPaths = db.query('SELECT DISTINCT project_path FROM stream_storage').all() as Array<{
		project_path: string;
	}>;
	const vectorPaths = db.query('SELECT DISTINCT project_path FROM vector_storage').all() as Array<{
		project_path: string;
	}>;

	// Combine and deduplicate all project paths
	const allPaths = new Set<string>();
	[...kvPaths, ...objectPaths, ...streamPaths, ...vectorPaths].forEach((row) => {
		allPaths.add(row.project_path);
	});

	// Check which paths no longer exist and are not the current project
	const pathsToDelete: string[] = [];
	for (const path of allPaths) {
		if (path !== currentProjectPath && !existsSync(path)) {
			pathsToDelete.push(path);
		}
	}

	// Delete data for removed projects
	if (pathsToDelete.length > 0) {
		const placeholders = pathsToDelete.map(() => '?').join(', ');

		// Delete from all tables
		const deleteKv = db.prepare(`DELETE FROM kv_storage WHERE project_path IN (${placeholders})`);
		const deleteObject = db.prepare(
			`DELETE FROM object_storage WHERE project_path IN (${placeholders})`
		);
		const deleteStream = db.prepare(
			`DELETE FROM stream_storage WHERE project_path IN (${placeholders})`
		);
		const deleteVector = db.prepare(
			`DELETE FROM vector_storage WHERE project_path IN (${placeholders})`
		);

		deleteKv.run(...pathsToDelete);
		deleteObject.run(...pathsToDelete);
		deleteStream.run(...pathsToDelete);
		deleteVector.run(...pathsToDelete);

		console.log(`[LocalDB] Cleaned up data for ${pathsToDelete.length} orphaned project(s)`);
	}
}

export function closeLocalDB(): void {
	if (dbInstance) {
		dbInstance.close();
		dbInstance = null;
	}
}
