import { test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	loadConfig,
	generateYAMLTemplate,
	saveConfig,
	getProfile,
	resetConfigCache,
} from '../../src/config';
import type { Config } from '../../src/types';

let testConfigDir: string;
let originalEnvVars: Record<string, string | undefined> = {};

const ENV_VARS_TO_CLEAR = [
	'AGENTUITY_CONFIG_DIR',
	'AGENTUITY_PROFILE',
	'AGENTUITY_API_URL',
	'AGENTUITY_APP_URL',
	'AGENTUITY_CATALYST_URL',
	'AGENTUITY_TRANSPORT_URL',
	'AGENTUITY_KEYVALUE_URL',
	'AGENTUITY_SANDBOX_URL',
	'AGENTUITY_VECTOR_URL',
	'AGENTUITY_STREAM_URL',
	'AGENTUITY_REGION',
	'AGENTUITY_CLI_API_KEY',
	'AGENTUITY_USER_ID',
	'AGENTUITY_API_KEY',
];

beforeEach(() => {
	testConfigDir = join(tmpdir(), `agentuity-profile-test-${Date.now()}-${Math.random()}`);
	mkdirSync(testConfigDir, { recursive: true });

	for (const key of ENV_VARS_TO_CLEAR) {
		originalEnvVars[key] = process.env[key];
		delete process.env[key];
	}

	process.env.AGENTUITY_CONFIG_DIR = testConfigDir;
	resetConfigCache();
});

afterEach(() => {
	resetConfigCache();

	for (const [key, value] of Object.entries(originalEnvVars)) {
		if (value !== undefined) {
			process.env[key] = value;
		} else {
			delete process.env[key];
		}
	}
	originalEnvVars = {};

	try {
		rmSync(testConfigDir, { recursive: true, force: true });
	} catch {
		// Ignore cleanup errors
	}
});

test('profile creation > new profile should not inherit auth from cached config', async () => {
	const configDir = testConfigDir;

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

	const loadedProd = await loadConfig(prodPath);
	expect(loadedProd).not.toBeNull();
	expect(loadedProd?.auth).toBeDefined();
	expect((loadedProd?.auth as { api_key?: string })?.api_key).toBe('secret-api-key-123');

	const newProfileName = 'staging';
	const newProfilePath = join(configDir, `${newProfileName}.yaml`);
	const template = generateYAMLTemplate(newProfileName);
	await Bun.write(newProfilePath, template);

	const newProfile = await loadConfig(newProfilePath);

	expect(newProfile).not.toBeNull();
	expect(newProfile?.name).toBe(newProfileName);
	expect(newProfile?.auth).toBeUndefined();
	expect(newProfile?.preferences).toBeUndefined();
	expect(newProfile?.overrides).toEqual({});
});

test('profile creation > new profile should not inherit preferences from cached config', async () => {
	const configDir = testConfigDir;

	const config1: Config = {
		name: 'local',
		preferences: {
			orgId: 'my-org',
			project_dir: '/path/to/project',
		},
	};

	const config1Path = join(configDir, 'local.yaml');
	await saveConfig(config1, config1Path);

	const loaded1 = await loadConfig(config1Path);
	expect(loaded1?.preferences).toBeDefined();

	const newProfileName = 'dev';
	const newProfilePath = join(configDir, `${newProfileName}.yaml`);
	const template = generateYAMLTemplate(newProfileName);
	await Bun.write(newProfilePath, template);

	const newProfile = await loadConfig(newProfilePath);

	expect(newProfile?.name).toBe(newProfileName);
	expect(newProfile?.preferences).toBeUndefined();
});

test('profile creation > new profile should not inherit overrides from cached config', async () => {
	const configDir = testConfigDir;

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

	const loaded1 = await loadConfig(config1Path);
	expect(loaded1?.overrides).toBeDefined();
	expect(loaded1?.overrides?.api_url).toBe('https://custom.example.com');

	const newProfileName = 'fresh';
	const newProfilePath = join(configDir, `${newProfileName}.yaml`);
	const template = generateYAMLTemplate(newProfileName);
	await Bun.write(newProfilePath, template);

	const newProfile = await loadConfig(newProfilePath);

	expect(newProfile?.name).toBe(newProfileName);
	expect(newProfile?.overrides).toEqual({});
	expect(newProfile?.overrides?.api_url).toBeUndefined();
});

test('profile creation > multiple loads of custom path should reload from disk', async () => {
	const configDir = testConfigDir;

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

	const load1 = await loadConfig(prodPath);
	expect(load1?.auth).toBeDefined();

	const load2 = await loadConfig(prodPath);
	expect(load2?.auth).toBeDefined();
	expect(load2?.name).toBe('production');
});

test('profile flag > loadConfig with explicit customPath loads correct profile', async () => {
	const configDir = testConfigDir;

	const testProfile: Config = {
		name: 'my-custom-profile',
		overrides: {
			api_url: 'https://custom-api.example.com',
		},
	};

	const profilePath = join(configDir, 'my-custom-profile.yaml');
	await saveConfig(testProfile, profilePath);

	const config = await loadConfig(profilePath);
	expect(config).not.toBeNull();
	expect(config?.name).toBe('my-custom-profile');
	expect(config?.overrides?.api_url).toBe('https://custom-api.example.com');
});

test('profile flag > loadConfig customPath takes precedence over profileFromFlag', async () => {
	const configDir = testConfigDir;

	const testProfile: Config = {
		name: 'test-profile',
	};
	const profilePath = join(configDir, 'test-profile.yaml');
	await saveConfig(testProfile, profilePath);

	const config = await loadConfig(profilePath, false, 'ignored-profile');
	expect(config).not.toBeNull();
	expect(config?.name).toBe('test-profile');
});

test('profile flag > getProfile throws error when profile file does not exist', async () => {
	const nonExistentProfile = 'non-existent-profile-12345';

	await expect(getProfile(nonExistentProfile)).rejects.toThrow(
		`Profile '${nonExistentProfile}' not found`
	);
});
