import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	clearStoredCoderApiKey,
	getStoredCoderApiKey,
	getStoredCoderHubUrl,
	saveCoderApiKey,
	saveCoderHubUrl,
} from '../src/coder-config';
import { loadConfig, resetConfigCache } from '../src/config';
import {
	clearStoredHubApiKeyOnUnauthorized,
	resolveHubApiKey,
	resolveHubUrl,
} from '../src/cmd/coder/hub-url';
import { isMacOS } from '../src/keychain';

describe('coder config storage', () => {
	let testDir: string;
	let originalConfigDir: string | undefined;
	let originalHubUrl: string | undefined;
	let originalHubApiKey: string | undefined;
	let originalDevmodeUrl: string | undefined;

	beforeEach(() => {
		testDir = join(tmpdir(), `agentuity-coder-config-${Date.now()}-${Math.random()}`);
		mkdirSync(testDir, { recursive: true });

		originalConfigDir = process.env.AGENTUITY_CONFIG_DIR;
		originalHubUrl = process.env.AGENTUITY_CODER_HUB_URL;
		originalHubApiKey = process.env.AGENTUITY_CODER_API_KEY;
		originalDevmodeUrl = process.env.AGENTUITY_DEVMODE_URL;

		process.env.AGENTUITY_CONFIG_DIR = testDir;
		delete process.env.AGENTUITY_CODER_HUB_URL;
		delete process.env.AGENTUITY_CODER_API_KEY;
		delete process.env.AGENTUITY_DEVMODE_URL;

		resetConfigCache();
	});

	afterEach(() => {
		resetConfigCache();

		if (originalConfigDir === undefined) {
			delete process.env.AGENTUITY_CONFIG_DIR;
		} else {
			process.env.AGENTUITY_CONFIG_DIR = originalConfigDir;
		}

		if (originalHubUrl === undefined) {
			delete process.env.AGENTUITY_CODER_HUB_URL;
		} else {
			process.env.AGENTUITY_CODER_HUB_URL = originalHubUrl;
		}

		if (originalHubApiKey === undefined) {
			delete process.env.AGENTUITY_CODER_API_KEY;
		} else {
			process.env.AGENTUITY_CODER_API_KEY = originalHubApiKey;
		}

		if (originalDevmodeUrl === undefined) {
			delete process.env.AGENTUITY_DEVMODE_URL;
		} else {
			process.env.AGENTUITY_DEVMODE_URL = originalDevmodeUrl;
		}

		try {
			rmSync(testDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors.
		}
	});

	test('saves and loads a normalized stored Hub URL', async () => {
		const result = await saveCoderHubUrl('ws://127.0.0.1:3650/api/ws');

		expect(result).toEqual({
			profileName: 'production',
			hubUrl: 'http://127.0.0.1:3650',
		});
		await expect(getStoredCoderHubUrl()).resolves.toBe('http://127.0.0.1:3650');
		await expect(resolveHubUrl()).resolves.toBe('http://127.0.0.1:3650');
	});

	test('stored Hub URL beats AGENTUITY_DEVMODE_URL when no explicit override is set', async () => {
		await saveCoderHubUrl('https://stored.example.com');
		process.env.AGENTUITY_DEVMODE_URL = 'https://devmode.example.com';

		await expect(resolveHubUrl()).resolves.toBe('https://stored.example.com');
	});

	test('saves and resolves stored Hub API key on non-macOS via file fallback', async () => {
		if (isMacOS()) return;

		await saveCoderApiKey('agc_stored');

		await expect(getStoredCoderApiKey()).resolves.toBe('agc_stored');
		await expect(resolveHubApiKey()).resolves.toEqual({
			apiKey: 'agc_stored',
			source: 'stored',
		});
	});

	test('clears stored Hub API key on unauthorized response for stored credentials', async () => {
		if (isMacOS()) return;

		await saveCoderApiKey('agc_stored');
		await expect(
			clearStoredHubApiKeyOnUnauthorized(
				401,
				{
					apiKey: 'agc_stored',
					source: 'stored',
				},
				await loadConfig()
			)
		).resolves.toBe(true);
		await expect(getStoredCoderApiKey()).resolves.toBeNull();
	});

	test('manual clear removes stored Hub API key on non-macOS file fallback', async () => {
		if (isMacOS()) return;

		await saveCoderApiKey('agc_stored');
		await clearStoredCoderApiKey();
		await expect(getStoredCoderApiKey()).resolves.toBeNull();
	});
});
