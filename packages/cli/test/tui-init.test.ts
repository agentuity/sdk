import { describe, expect, test } from 'bun:test';
import { probeHubInitAccess } from '../src/cmd/coder/tui-init';

describe('probeHubInitAccess', () => {
	test('returns ok for a valid init payload', async () => {
		const result = await probeHubInitAccess('http://hub.test', {
			fetchImpl: async () =>
				new Response(JSON.stringify({ type: 'init', tools: [] }), {
					status: 200,
					headers: { 'content-type': 'application/json' },
				}),
		});

		expect(result).toEqual({ ok: true });
	});

	test('surfaces auth failures with server message', async () => {
		const result = await probeHubInitAccess('http://hub.test', {
			fetchImpl: async () =>
				new Response(JSON.stringify({ error: 'Unauthorized: API key required' }), {
					status: 401,
					headers: { 'content-type': 'application/json' },
				}),
		});

		expect(result).toEqual({
			ok: false,
			code: 'unauthorized',
			message: 'Unauthorized: API key required',
		});
	});

	test('rejects non-init success payloads', async () => {
		const result = await probeHubInitAccess('http://hub.test', {
			fetchImpl: async () =>
				new Response(JSON.stringify({ ok: true }), {
					status: 200,
					headers: { 'content-type': 'application/json' },
				}),
		});

		expect(result).toEqual({
			ok: false,
			code: 'invalid_response',
			message: 'Hub init endpoint did not return an init payload',
		});
	});

	test('passes an explicit API key header when provided', async () => {
		let seenApiKey: string | undefined;

		const result = await probeHubInitAccess('http://hub.test', {
			apiKey: 'agc_test',
			fetchImpl: async (_input, init) => {
				const headers = init?.headers as Record<string, string> | undefined;
				seenApiKey = headers?.['x-agentuity-auth-api-key'];
				return new Response(JSON.stringify({ type: 'init', tools: [] }), {
					status: 200,
					headers: { 'content-type': 'application/json' },
				});
			},
		});

		expect(result).toEqual({ ok: true });
		expect(seenApiKey).toBe('agc_test');
	});
});
