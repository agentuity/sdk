import { afterEach, describe, expect, test } from 'bun:test';
import {
	clearStoredHubApiKeyOnUnauthorized,
	formatHubUnauthorizedMessage,
	resolveHubApiKey,
	resolveHubUrl,
	toHubWsUrl,
} from '../src/cmd/coder/hub-url';

const originalCoderHubUrl = process.env.AGENTUITY_CODER_HUB_URL;
const originalCoderApiKey = process.env.AGENTUITY_CODER_API_KEY;
const originalDevmodeUrl = process.env.AGENTUITY_DEVMODE_URL;

afterEach(() => {
	if (originalCoderHubUrl === undefined) {
		delete process.env.AGENTUITY_CODER_HUB_URL;
	} else {
		process.env.AGENTUITY_CODER_HUB_URL = originalCoderHubUrl;
	}

	if (originalCoderApiKey === undefined) {
		delete process.env.AGENTUITY_CODER_API_KEY;
	} else {
		process.env.AGENTUITY_CODER_API_KEY = originalCoderApiKey;
	}

	if (originalDevmodeUrl === undefined) {
		delete process.env.AGENTUITY_DEVMODE_URL;
	} else {
		process.env.AGENTUITY_DEVMODE_URL = originalDevmodeUrl;
	}
});

describe('coder hub URL normalization', () => {
	test('strips a raw /ws path down to the Hub HTTP base URL', async () => {
		await expect(resolveHubUrl('ws://127.0.0.1:3650/ws')).resolves.toBe('http://127.0.0.1:3650');
	});

	test('strips the canonical /api/ws path down to the Hub HTTP base URL', async () => {
		await expect(resolveHubUrl('ws://127.0.0.1:3650/api/ws')).resolves.toBe(
			'http://127.0.0.1:3650'
		);
	});

	test('always rebuilds the canonical WebSocket route', () => {
		expect(toHubWsUrl('http://127.0.0.1:3650')).toBe('ws://127.0.0.1:3650/api/ws');
	});

	test('prefers stored profile hub URL over devmode URL', async () => {
		delete process.env.AGENTUITY_CODER_HUB_URL;
		process.env.AGENTUITY_DEVMODE_URL = 'https://devmode.example.com';

		const config = {
			name: 'production',
			coder: {
				hubUrl: 'https://stored.example.com',
			},
		};

		await expect(resolveHubUrl(undefined, config)).resolves.toBe('https://stored.example.com');
	});
});

describe('coder hub API key resolution', () => {
	test('prefers env API key over stored profile key', async () => {
		process.env.AGENTUITY_CODER_API_KEY = 'agc_env';

		const config = {
			name: 'production',
			coder: {
				apiKey: 'agc_stored',
			},
		};

		await expect(resolveHubApiKey(config)).resolves.toEqual({
			apiKey: 'agc_env',
			source: 'env',
		});
	});

	test('uses stored profile API key when no env override is set', async () => {
		delete process.env.AGENTUITY_CODER_API_KEY;

		const config = {
			name: 'production',
			coder: {
				apiKey: 'agc_stored',
			},
		};

		await expect(resolveHubApiKey(config)).resolves.toEqual({
			apiKey: 'agc_stored',
			source: 'stored',
		});
	});

	test('clears stored keys only for stored-key auth failures', async () => {
		let clearCalls = 0;
		const clearFn = async () => {
			clearCalls += 1;
		};

		await expect(
			clearStoredHubApiKeyOnUnauthorized(
				401,
				{
					apiKey: 'agc_stored',
					source: 'stored',
				},
				clearFn
			)
		).resolves.toBe(true);
		expect(clearCalls).toBe(1);

		await expect(
			clearStoredHubApiKeyOnUnauthorized(
				401,
				{
					apiKey: 'agc_env',
					source: 'env',
				},
				clearFn
			)
		).resolves.toBe(false);
		expect(clearCalls).toBe(1);
	});

	test('formats auth failures with config-first guidance', () => {
		const message = formatHubUnauthorizedMessage('https://hub.example.com', 'Unauthorized', {
			clearedStoredKey: true,
		});

		expect(message).toContain('Stored Hub API key cleared.');
		expect(message).toContain('coder config set apikey <apikey>');
		expect(message).toContain('AGENTUITY_CODER_API_KEY');
	});
});
