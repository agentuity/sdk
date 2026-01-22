import { describe, test, expect, beforeEach, afterAll } from 'bun:test';
import { Database } from 'bun:sqlite';
import { join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';

const TTL_DAYS = 7;
const TTL_MS = TTL_DAYS * 24 * 60 * 60 * 1000;

type ResourceType = 'sandbox' | 'bucket' | 'db' | 'project';

describe('ResourceRegionCache', () => {
	let db: Database;
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), 'resource-cache-test-'));
		const dbPath = join(tempDir, 'resource.db');
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
	});

	afterAll(async () => {
		if (db) {
			db.close();
		}
		if (tempDir) {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	function getRegion(type: ResourceType, profile: string, id: string): string | null {
		const cutoff = Date.now() - TTL_MS;
		db.run('DELETE FROM resource_region_cache WHERE last_updated < ?', [cutoff]);

		const row = db
			.query<
				{ region: string },
				[string, string, string]
			>('SELECT region FROM resource_region_cache WHERE resource_type = ? AND profile = ? AND id = ?')
			.get(type, profile, id);

		return row?.region ?? null;
	}

	function setRegion(type: ResourceType, profile: string, id: string, region: string): void {
		db.run(
			`INSERT OR REPLACE INTO resource_region_cache 
			 (resource_type, profile, id, region, last_updated)
			 VALUES (?, ?, ?, ?, ?)`,
			[type, profile, id, region, Date.now()]
		);
	}

	function deleteRegion(type: ResourceType, profile: string, id: string): void {
		db.run(
			'DELETE FROM resource_region_cache WHERE resource_type = ? AND profile = ? AND id = ?',
			[type, profile, id]
		);
	}

	function clearProfile(profile: string): void {
		db.run('DELETE FROM resource_region_cache WHERE profile = ?', [profile]);
	}

	test('should return null for non-existent entry', () => {
		const result = getRegion('sandbox', 'production', 'sbx_nonexistent');
		expect(result).toBeNull();
	});

	test('should store and retrieve a region', () => {
		setRegion('sandbox', 'production', 'sbx_123', 'use');
		const result = getRegion('sandbox', 'production', 'sbx_123');
		expect(result).toBe('use');
	});

	test('should update existing entry', () => {
		setRegion('sandbox', 'production', 'sbx_123', 'use');
		setRegion('sandbox', 'production', 'sbx_123', 'usw');
		const result = getRegion('sandbox', 'production', 'sbx_123');
		expect(result).toBe('usw');
	});

	test('should delete an entry', () => {
		setRegion('sandbox', 'production', 'sbx_123', 'use');
		deleteRegion('sandbox', 'production', 'sbx_123');
		const result = getRegion('sandbox', 'production', 'sbx_123');
		expect(result).toBeNull();
	});

	test('should scope entries by profile', () => {
		setRegion('sandbox', 'production', 'sbx_123', 'use');
		setRegion('sandbox', 'local', 'sbx_123', 'local');

		expect(getRegion('sandbox', 'production', 'sbx_123')).toBe('use');
		expect(getRegion('sandbox', 'local', 'sbx_123')).toBe('local');
	});

	test('should scope entries by resource type', () => {
		setRegion('sandbox', 'production', 'sbx_123', 'use');
		setRegion('bucket', 'production', 'ag-abc123', 'usw');

		expect(getRegion('sandbox', 'production', 'sbx_123')).toBe('use');
		expect(getRegion('bucket', 'production', 'ag-abc123')).toBe('usw');
	});

	test('should clear all entries for a profile', () => {
		setRegion('sandbox', 'production', 'sbx_123', 'use');
		setRegion('bucket', 'production', 'ag-abc123', 'usw');
		setRegion('sandbox', 'local', 'sbx_456', 'local');

		clearProfile('production');

		expect(getRegion('sandbox', 'production', 'sbx_123')).toBeNull();
		expect(getRegion('bucket', 'production', 'ag-abc123')).toBeNull();
		expect(getRegion('sandbox', 'local', 'sbx_456')).toBe('local');
	});

	test('should prune expired entries on read', () => {
		const oldTimestamp = Date.now() - TTL_MS - 1000;

		db.run(
			`INSERT INTO resource_region_cache 
			 (resource_type, profile, id, region, last_updated)
			 VALUES (?, ?, ?, ?, ?)`,
			['sandbox', 'production', 'sbx_old', 'use', oldTimestamp]
		);

		setRegion('sandbox', 'production', 'sbx_new', 'usw');

		const oldResult = getRegion('sandbox', 'production', 'sbx_old');
		expect(oldResult).toBeNull();

		const newResult = getRegion('sandbox', 'production', 'sbx_new');
		expect(newResult).toBe('usw');
	});

	test('should handle all resource types', () => {
		const types: ResourceType[] = ['sandbox', 'bucket', 'db', 'project'];

		for (const type of types) {
			setRegion(type, 'production', `${type}_123`, 'use');
			expect(getRegion(type, 'production', `${type}_123`)).toBe('use');
		}
	});
});
