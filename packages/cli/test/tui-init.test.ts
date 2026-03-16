import { describe, expect, test } from 'bun:test';
import { probeTuiInitAccess } from '../src/cmd/coder/tui-init';

describe('probeTuiInitAccess', () => {
	test('returns ok for a valid init payload', async () => {
		const result = await probeTuiInitAccess(
			'http://hub.test',
			async () =>
				new Response(JSON.stringify({ type: 'init', tools: [] }), {
					status: 200,
					headers: { 'content-type': 'application/json' },
				})
		);

		expect(result).toEqual({ ok: true });
	});

	test('surfaces auth failures with server message', async () => {
		const result = await probeTuiInitAccess(
			'http://hub.test',
			async () =>
				new Response(JSON.stringify({ error: 'Unauthorized: API key required' }), {
					status: 401,
					headers: { 'content-type': 'application/json' },
				})
		);

		expect(result).toEqual({
			ok: false,
			code: 'unauthorized',
			message: 'Unauthorized: API key required',
		});
	});

	test('rejects non-init success payloads', async () => {
		const result = await probeTuiInitAccess(
			'http://hub.test',
			async () =>
				new Response(JSON.stringify({ ok: true }), {
					status: 200,
					headers: { 'content-type': 'application/json' },
				})
		);

		expect(result).toEqual({
			ok: false,
			code: 'invalid_response',
			message: 'Hub init endpoint did not return an init payload',
		});
	});
});
