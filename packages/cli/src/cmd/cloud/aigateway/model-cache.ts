import { Database } from 'bun:sqlite';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { AIGatewayModelsSchema, type AIGatewayModels } from '@agentuity/core';
import { getDefaultConfigDir } from '../../../config';

const TTL_MS = 6 * 60 * 60 * 1000;

let db: Database | null = null;

async function getDatabase(): Promise<Database> {
	if (db) {
		return db;
	}

	const configDir = getDefaultConfigDir();
	await mkdir(configDir, { recursive: true });

	db = new Database(join(configDir, 'resource.db'));
	db.run('PRAGMA journal_mode = WAL');
	db.run('PRAGMA busy_timeout = 5000');
	db.run('PRAGMA synchronous = NORMAL');
	db.run(`
		CREATE TABLE IF NOT EXISTS aigateway_model_cache (
			profile TEXT NOT NULL,
			cache_key TEXT NOT NULL,
			models_json TEXT NOT NULL,
			cached_at INTEGER NOT NULL,
			PRIMARY KEY (profile, cache_key)
		)
	`);
	db.run(`
		CREATE INDEX IF NOT EXISTS idx_aigateway_model_cache_cached_at
		ON aigateway_model_cache(cached_at)
	`);

	return db;
}

export async function getCachedAIGatewayModels(
	profile: string,
	cacheKey: string
): Promise<AIGatewayModels | null> {
	try {
		const database = await getDatabase();
		const cutoff = Date.now() - TTL_MS;
		const row = database
			.query<{ models_json: string; cached_at: number }, [string, string]>(
				'SELECT models_json, cached_at FROM aigateway_model_cache WHERE profile = ? AND cache_key = ?'
			)
			.get(profile, cacheKey);
		if (!row) {
			return null;
		}
		if (row.cached_at < cutoff) {
			database.run('DELETE FROM aigateway_model_cache WHERE profile = ? AND cache_key = ?', [
				profile,
				cacheKey,
			]);
			return null;
		}
		const parsed = AIGatewayModelsSchema.safeParse(JSON.parse(row.models_json));
		return parsed.success ? parsed.data : null;
	} catch {
		return null;
	}
}

export async function setCachedAIGatewayModels(
	profile: string,
	cacheKey: string,
	models: AIGatewayModels
): Promise<void> {
	try {
		const database = await getDatabase();
		const cutoff = Date.now() - TTL_MS;
		database.run('DELETE FROM aigateway_model_cache WHERE cached_at < ?', [cutoff]);
		database.run(
			`INSERT INTO aigateway_model_cache (profile, cache_key, models_json, cached_at)
			 VALUES (?, ?, ?, ?)
			 ON CONFLICT(profile, cache_key) DO UPDATE SET
			 models_json = excluded.models_json,
			 cached_at = excluded.cached_at`,
			[profile, cacheKey, JSON.stringify(models), Date.now()]
		);
	} catch {
		// Non-critical cache failure should never block the CLI.
	}
}
