import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	loadEnvFiles,
	loadProjectEnvVars,
	looksLikeEnvAssignment,
	looksLikeEnvFilePath,
	resetActiveEnvFilePaths,
	getActiveEnvFilePaths,
} from '../../src/env-util.ts';

let testDir: string;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(async () => {
	testDir = await mkdtemp(join(tmpdir(), 'agentuity-env-files-'));
	resetActiveEnvFilePaths();
	// Snapshot keys we may mutate
	for (const key of ['FOO', 'BAR', 'AGENTUITY_SDK_KEY', 'SHARED']) {
		savedEnv[key] = process.env[key];
		delete process.env[key];
	}
});

afterEach(async () => {
	await rm(testDir, { recursive: true, force: true });
	resetActiveEnvFilePaths();
	for (const [key, value] of Object.entries(savedEnv)) {
		if (value === undefined) {
			delete process.env[key];
		} else {
			process.env[key] = value;
		}
	}
});

async function writeEnv(name: string, content: string) {
	const path = join(testDir, name);
	await writeFile(path, content);
	return path;
}

describe('looksLikeEnvFilePath / looksLikeEnvAssignment', () => {
	test('recognizes common env file paths', () => {
		expect(looksLikeEnvFilePath('.env')).toBe(true);
		expect(looksLikeEnvFilePath('.env.staging')).toBe(true);
		expect(looksLikeEnvFilePath('./.env.prod')).toBe(true);
		expect(looksLikeEnvFilePath('/abs/path/.env')).toBe(true);
		expect(looksLikeEnvFilePath('~/project/.env')).toBe(true);
		expect(looksLikeEnvFilePath('config.env')).toBe(true);
	});

	test('rejects filters and KEY=VALUE assignments', () => {
		expect(looksLikeEnvFilePath('production')).toBe(false);
		expect(looksLikeEnvFilePath('FOO=bar')).toBe(false);
		expect(looksLikeEnvFilePath('DATABASE_URL:my_db')).toBe(false);
		expect(looksLikeEnvAssignment('FOO=bar')).toBe(true);
		expect(looksLikeEnvAssignment('DATABASE_URL:my_db')).toBe(true);
		expect(looksLikeEnvAssignment('.env')).toBe(false);
	});
});

describe('loadEnvFiles', () => {
	test('merges files in order with later overriding earlier', async () => {
		const base = await writeEnv(
			'.env',
			'FOO=from-base\nSHARED=base\nAGENTUITY_SDK_KEY=key-base\n'
		);
		const staging = await writeEnv(
			'.env.staging',
			'BAR=from-staging\nSHARED=staging\nAGENTUITY_SDK_KEY=key-staging\n'
		);

		const result = await loadEnvFiles([base, staging]);
		expect(result.vars.FOO).toBe('from-base');
		expect(result.vars.BAR).toBe('from-staging');
		expect(result.vars.SHARED).toBe('staging');
		expect(result.vars.AGENTUITY_SDK_KEY).toBe('key-staging');
		expect(result.files).toEqual([base, staging]);
		expect(getActiveEnvFilePaths()).toEqual([base, staging]);
	});

	test('applies to process.env when requested', async () => {
		const base = await writeEnv('.env', 'FOO=loaded\n');
		await loadEnvFiles([base], { applyToProcessEnv: true, overwriteProcessEnv: true });
		expect(process.env.FOO).toBe('loaded');
	});

	test('skips non-file --env values (import / session filters)', async () => {
		const base = await writeEnv('.env', 'FOO=ok\n');
		const result = await loadEnvFiles([base, 'production', 'DATABASE_URL:my_db', 'FOO=bar']);
		expect(result.vars).toEqual({ FOO: 'ok' });
		expect(result.files).toEqual([base]);
	});

	test('throws when a path-like env file is missing', async () => {
		const missing = join(testDir, '.env.missing');
		await expect(loadEnvFiles([missing])).rejects.toThrow(/Env file not found/);
	});
});

describe('loadProjectEnvVars', () => {
	test('defaults to project .env', async () => {
		await writeEnv('.env', 'FOO=default\n');
		const result = await loadProjectEnvVars(testDir);
		expect(result.vars.FOO).toBe('default');
		expect(result.files.some((f) => f.endsWith('.env'))).toBe(true);
	});

	test('uses explicit files when provided', async () => {
		const a = await writeEnv('.env', 'FOO=a\nSHARED=a\n');
		const b = await writeEnv('.env.staging', 'SHARED=b\n');
		const result = await loadProjectEnvVars(testDir, [a, b]);
		expect(result.vars.FOO).toBe('a');
		expect(result.vars.SHARED).toBe('b');
	});
});
