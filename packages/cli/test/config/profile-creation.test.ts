import { test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, generateYAMLTemplate, saveConfig } from '../../src/config';
import type { Config } from '../../src/types';

let testConfigDir: string;
let originalHome: string | undefined;
let originalEnvVars: Record<string, string | undefined> = {};

beforeEach(async () => {
	// Create a temporary directory for test configs
	testConfigDir = await mkdtemp(join(tmpdir(), 'agentuity-test-'));

	// Override home directory for config path resolution
	originalHome = process.env.HOME;
	process.env.HOME = testConfigDir;

	// Clear any Agentuity environment variables that might affect config loading
	const envVarsToClear = [
		'AGENTUITY_API_URL',
		'AGENTUITY_APP_URL',
		'AGENTUITY_CATALYST_URL',
		'AGENTUITY_TRANSPORT_URL',
		'AGENTUITY_KEYVALUE_URL',
		'AGENTUITY_VECTOR_URL',
		'AGENTUITY_STREAM_URL',
	];
	for (const key of envVarsToClear) {
		originalEnvVars[key] = process.env[key];
		delete process.env[key];
	}
});

afterEach(async () => {
	// Restore original home
	if (originalHome !== undefined) {
		process.env.HOME = originalHome;
	} else {
		delete process.env.HOME;
	}

	// Restore original environment variables
	for (const [key, value] of Object.entries(originalEnvVars)) {
		if (value !== undefined) {
			process.env[key] = value;
		} else {
			delete process.env[key];
		}
	}
	originalEnvVars = {};

	// Clean up test directory
	await rm(testConfigDir, { recursive: true, force: true });

	// Clear module-level config cache by re-importing
	// Note: This is a workaround since we can't directly access cachedConfig
	// The fix ensures customPath bypasses cache anyway
});

test('profile creation > new profile should not inherit auth from cached config', async () => {
	const configDir = join(testConfigDir, '.config', 'agentuity');
	await mkdir(configDir, { recursive: true });

	// Create a "production" profile with auth settings
	const prodConfig: Config = {
		name: 'production',
		auth: {
			api_key: 'secret-api-key-123',
			user_id: 'user-abc-123',
			expires: Date.now() + 86400000,
		},
		preferences: {
			orgId: 'org-xyz-789',
			project_dir: '/some/project/path',
		},
		overrides: {
			api_url: 'https://custom-api.example.com',
		},
	};

	const prodPath = join(configDir, 'production.yaml');
	await saveConfig(prodConfig, prodPath);

	// Load the production config to populate cache
	const loadedProd = await loadConfig(prodPath);
	expect(loadedProd).not.toBeNull();
	expect(loadedProd?.auth).toBeDefined();
	expect((loadedProd?.auth as { api_key?: string })?.api_key).toBe('secret-api-key-123');

	// Now create a new profile (simulating profile create command)
	const newProfileName = 'staging';
	const newProfilePath = join(configDir, `${newProfileName}.yaml`);
	const template = generateYAMLTemplate(newProfileName);
	await writeFile(newProfilePath, template, { mode: 0o600 });

	// Load the new profile (this should NOT use cached config)
	const newProfile = await loadConfig(newProfilePath);

	// Verify the new profile is clean - no auth, no preferences leaked
	expect(newProfile).not.toBeNull();
	expect(newProfile?.name).toBe(newProfileName);
	expect(newProfile?.auth).toBeUndefined();
	expect(newProfile?.preferences).toBeUndefined();

	// Overrides is initialized to empty object (for env var handling), but should be empty
	expect(newProfile?.overrides).toEqual({});
});

test('profile creation > new profile should not inherit preferences from cached config', async () => {
	const configDir = join(testConfigDir, '.config', 'agentuity');
	await mkdir(configDir, { recursive: true });

	// Create a config with preferences
	const config1: Config = {
		name: 'local',
		preferences: {
			orgId: 'my-org',
			project_dir: '/path/to/project',
		},
	};

	const config1Path = join(configDir, 'local.yaml');
	await saveConfig(config1, config1Path);

	// Load first config to cache it
	const loaded1 = await loadConfig(config1Path);
	expect(loaded1?.preferences).toBeDefined();

	// Create and load a new profile
	const newProfileName = 'dev';
	const newProfilePath = join(configDir, `${newProfileName}.yaml`);
	const template = generateYAMLTemplate(newProfileName);
	await writeFile(newProfilePath, template, { mode: 0o600 });

	const newProfile = await loadConfig(newProfilePath);

	// New profile should be clean
	expect(newProfile?.name).toBe(newProfileName);
	expect(newProfile?.preferences).toBeUndefined();
});

test('profile creation > new profile should not inherit overrides from cached config', async () => {
	const configDir = join(testConfigDir, '.config', 'agentuity');
	await mkdir(configDir, { recursive: true });

	// Create a config with custom overrides
	const config1: Config = {
		name: 'custom',
		overrides: {
			api_url: 'https://custom.example.com',
			catalyst_url: 'https://custom-catalyst.example.com',
			kv_url: 'https://custom-kv.example.com',
		},
	};

	const config1Path = join(configDir, 'custom.yaml');
	await saveConfig(config1, config1Path);

	// Load first config to cache it
	const loaded1 = await loadConfig(config1Path);
	expect(loaded1?.overrides).toBeDefined();
	expect(loaded1?.overrides?.api_url).toBe('https://custom.example.com');

	// Create and load a new profile
	const newProfileName = 'fresh';
	const newProfilePath = join(configDir, `${newProfileName}.yaml`);
	const template = generateYAMLTemplate(newProfileName);
	await writeFile(newProfilePath, template, { mode: 0o600 });

	const newProfile = await loadConfig(newProfilePath);

	// New profile should not have the overrides from cached config
	expect(newProfile?.name).toBe(newProfileName);
	// Overrides is initialized to empty object, should not contain old config values
	expect(newProfile?.overrides).toEqual({});
	expect(newProfile?.overrides?.api_url).toBeUndefined();
});

test('profile creation > multiple loads of custom path should reload from disk', async () => {
	const configDir = join(testConfigDir, '.config', 'agentuity');
	await mkdir(configDir, { recursive: true });

	const prodConfig: Config = {
		name: 'production',
		auth: {
			api_key: 'test-key',
			user_id: 'test-user',
			expires: Date.now() + 86400000,
		},
	};

	const prodPath = join(configDir, 'production.yaml');
	await saveConfig(prodConfig, prodPath);

	// First load with custom path - should load from file
	const load1 = await loadConfig(prodPath);
	expect(load1?.auth).toBeDefined();

	// Second load with same custom path - should reload from disk (not use cache)
	// This is the key behavior that prevents profile creation from inheriting cached config
	const load2 = await loadConfig(prodPath);
	expect(load2?.auth).toBeDefined();
	expect(load2?.name).toBe('production');
});
