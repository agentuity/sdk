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

	// Task Storage table
	db.run(`
		CREATE TABLE IF NOT EXISTS task_storage (
			project_path TEXT NOT NULL,
			id TEXT NOT NULL,
			title TEXT NOT NULL,
			description TEXT,
			metadata TEXT,
			priority TEXT NOT NULL DEFAULT 'none',
			parent_id TEXT,
			type TEXT NOT NULL,
			status TEXT NOT NULL DEFAULT 'open',
			open_date TEXT,
			in_progress_date TEXT,
			closed_date TEXT,
			created_id TEXT NOT NULL,
			assigned_id TEXT,
			closed_id TEXT,
			deleted INTEGER NOT NULL DEFAULT 0,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL,
			PRIMARY KEY (project_path, id)
		)
	`);

	// Migration: add deleted column for existing databases
	try {
		db.run('ALTER TABLE task_storage ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0');
	} catch {
		// Column already exists
	}

	// Task Changelog table
	db.run(`
		CREATE TABLE IF NOT EXISTS task_changelog_storage (
			project_path TEXT NOT NULL,
			id TEXT NOT NULL,
			task_id TEXT NOT NULL,
			field TEXT NOT NULL,
			old_value TEXT,
			new_value TEXT,
			created_at INTEGER NOT NULL,
			PRIMARY KEY (project_path, id)
		)
	`);

	db.run(`
		CREATE INDEX IF NOT EXISTS idx_task_changelog_lookup
		ON task_changelog_storage(project_path, task_id)
	`);

	// Task Comment table
	db.run(`
		CREATE TABLE IF NOT EXISTS task_comment_storage (
			project_path TEXT NOT NULL,
			id TEXT NOT NULL,
			task_id TEXT NOT NULL,
			user_id TEXT NOT NULL,
			body TEXT NOT NULL,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL,
			PRIMARY KEY (project_path, id)
		)
	`);

	db.run(`
		CREATE INDEX IF NOT EXISTS idx_task_comment_lookup
		ON task_comment_storage(project_path, task_id)
	`);

	// Task Tag table
	db.run(`
		CREATE TABLE IF NOT EXISTS task_tag_storage (
			project_path TEXT NOT NULL,
			id TEXT NOT NULL,
			name TEXT NOT NULL,
			color TEXT,
			created_at INTEGER NOT NULL,
			PRIMARY KEY (project_path, id)
		)
	`);

	// Task-Tag association table
	db.run(`
		CREATE TABLE IF NOT EXISTS task_tag_association_storage (
			project_path TEXT NOT NULL,
			task_id TEXT NOT NULL,
			tag_id TEXT NOT NULL,
			PRIMARY KEY (project_path, task_id, tag_id)
		)
	`);

	db.run(`
		CREATE INDEX IF NOT EXISTS idx_task_tag_assoc_task
		ON task_tag_association_storage(project_path, task_id)
	`);

	db.run(`
		CREATE INDEX IF NOT EXISTS idx_task_tag_assoc_tag
		ON task_tag_association_storage(project_path, tag_id)
	`);
}

function cleanupOrphanedProjects(db: Database): void {
	// Get the current project path to exclude from cleanup
	const currentProjectPath = process.cwd();

	// Query all tables for unique project paths
	const kvPaths = db.query('SELECT DISTINCT project_path FROM kv_storage').all() as Array<{
		project_path: string;
	}>;
	const streamPaths = db.query('SELECT DISTINCT project_path FROM stream_storage').all() as Array<{
		project_path: string;
	}>;
	const vectorPaths = db.query('SELECT DISTINCT project_path FROM vector_storage').all() as Array<{
		project_path: string;
	}>;
	const taskPaths = db.query('SELECT DISTINCT project_path FROM task_storage').all() as Array<{
		project_path: string;
	}>;
	const taskChangelogPaths = db
		.query('SELECT DISTINCT project_path FROM task_changelog_storage')
		.all() as Array<{
		project_path: string;
	}>;
	const taskCommentPaths = db
		.query('SELECT DISTINCT project_path FROM task_comment_storage')
		.all() as Array<{
		project_path: string;
	}>;
	const taskTagPaths = db
		.query('SELECT DISTINCT project_path FROM task_tag_storage')
		.all() as Array<{
		project_path: string;
	}>;
	const taskTagAssocPaths = db
		.query('SELECT DISTINCT project_path FROM task_tag_association_storage')
		.all() as Array<{
		project_path: string;
	}>;

	// Combine and deduplicate all project paths
	const allPaths = new Set<string>();
	[
		...kvPaths,
		...streamPaths,
		...vectorPaths,
		...taskPaths,
		...taskChangelogPaths,
		...taskCommentPaths,
		...taskTagPaths,
		...taskTagAssocPaths,
	].forEach((row) => {
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
		const deleteStream = db.prepare(
			`DELETE FROM stream_storage WHERE project_path IN (${placeholders})`
		);
		const deleteVector = db.prepare(
			`DELETE FROM vector_storage WHERE project_path IN (${placeholders})`
		);
		const deleteTasks = db.prepare(
			`DELETE FROM task_storage WHERE project_path IN (${placeholders})`
		);
		const deleteTaskChangelog = db.prepare(
			`DELETE FROM task_changelog_storage WHERE project_path IN (${placeholders})`
		);
		const deleteTaskComments = db.prepare(
			`DELETE FROM task_comment_storage WHERE project_path IN (${placeholders})`
		);
		const deleteTaskTags = db.prepare(
			`DELETE FROM task_tag_storage WHERE project_path IN (${placeholders})`
		);
		const deleteTaskTagAssoc = db.prepare(
			`DELETE FROM task_tag_association_storage WHERE project_path IN (${placeholders})`
		);

		deleteKv.run(...pathsToDelete);
		deleteStream.run(...pathsToDelete);
		deleteVector.run(...pathsToDelete);
		deleteTasks.run(...pathsToDelete);
		deleteTaskChangelog.run(...pathsToDelete);
		deleteTaskComments.run(...pathsToDelete);
		deleteTaskTags.run(...pathsToDelete);
		deleteTaskTagAssoc.run(...pathsToDelete);

		console.log(`[LocalDB] Cleaned up data for ${pathsToDelete.length} orphaned project(s)`);
	}
}

export function closeLocalDB(): void {
	if (dbInstance) {
		dbInstance.close();
		dbInstance = null;
	}
}
