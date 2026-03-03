import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createProjectConfig } from '../../src/config.ts';
import { readEnvFile } from '../../src/env-util.ts';

let testDir: string;

beforeEach(async () => {
	testDir = await mkdtemp(join(tmpdir(), 'agentuity-create-project-'));
});

afterEach(async () => {
	await rm(testDir, { recursive: true, force: true });
});

function makeConfig(sdkKey: string) {
	return {
		projectId: 'proj_test123',
		orgId: 'org_test123',
		sdkKey,
		region: 'us-east-1',
	};
}

describe('createProjectConfig > .env handling', () => {
	test('creates new .env file when none exists', async () => {
		await createProjectConfig(testDir, makeConfig('test-sdk-key-new'));

		const envPath = join(testDir, '.env');
		const env = await readEnvFile(envPath);
		expect(env.AGENTUITY_SDK_KEY).toBe('test-sdk-key-new');

		// Verify the comment header is present in the raw file
		const raw = await Bun.file(envPath).text();
		expect(raw).toContain('# AGENTUITY_SDK_KEY is a sensitive value');
		expect(raw).toContain('AGENTUITY_SDK_KEY=test-sdk-key-new');
	});

	test('preserves existing .env content when updating SDK key', async () => {
		// Set up existing .env with multiple variables
		const envPath = join(testDir, '.env');
		await Bun.write(
			envPath,
			'BASE_URL=http://127.0.0.1:3500\nNODE_ENV=development\nAGENTUITY_SDK_KEY=old-key\n'
		);

		await createProjectConfig(testDir, makeConfig('new-sdk-key'));

		const env = await readEnvFile(envPath);
		expect(env.AGENTUITY_SDK_KEY).toBe('new-sdk-key');
		expect(env.BASE_URL).toBe('http://127.0.0.1:3500');
		expect(env.NODE_ENV).toBe('development');
	});

	test('preserves existing .env when no SDK key existed before', async () => {
		// Set up existing .env without an SDK key
		const envPath = join(testDir, '.env');
		await Bun.write(envPath, 'BASE_URL=http://127.0.0.1:3500\nAPI_SECRET=mysecret\n');

		await createProjectConfig(testDir, makeConfig('brand-new-key'));

		const env = await readEnvFile(envPath);
		expect(env.AGENTUITY_SDK_KEY).toBe('brand-new-key');
		expect(env.BASE_URL).toBe('http://127.0.0.1:3500');
		expect(env.API_SECRET).toBe('mysecret');
	});

	test('sets .env file permissions to 0600', async () => {
		await createProjectConfig(testDir, makeConfig('test-key'));

		const envPath = join(testDir, '.env');
		const stat = await Bun.file(envPath).stat();
		// Check that only owner has read/write (0o600 = 384 decimal)
		// Use bitwise AND with 0o777 to get just the permission bits
		expect(stat.mode & 0o777).toBe(0o600);
	});
});

describe('createProjectConfig > agentuity.json', () => {
	test('creates agentuity.json with correct structure', async () => {
		await createProjectConfig(testDir, makeConfig('test-sdk-key'));

		const configPath = join(testDir, 'agentuity.json');
		const raw = await Bun.file(configPath).text();
		const config = JSON.parse(raw);

		expect(config.$schema).toBe('https://agentuity.dev/schema/cli/v1/agentuity.json');
		expect(config.projectId).toBe('proj_test123');
		expect(config.orgId).toBe('org_test123');
		expect(config.region).toBe('us-east-1');
		expect(config.deployment).toBeDefined();
		expect(config.deployment.resources).toBeDefined();
		expect(config.deployment.resources.memory).toBe('500Mi');
		expect(config.deployment.resources.cpu).toBe('500m');
		expect(config.deployment.resources.disk).toBe('500Mi');
	});

	test('does not include sdkKey in agentuity.json', async () => {
		await createProjectConfig(testDir, makeConfig('secret-key'));

		const configPath = join(testDir, 'agentuity.json');
		const raw = await Bun.file(configPath).text();
		const config = JSON.parse(raw);

		expect(config.sdkKey).toBeUndefined();
		// Also make sure it doesn't appear in the raw JSON at all
		expect(raw).not.toContain('secret-key');
	});
});
