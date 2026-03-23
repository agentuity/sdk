import { describe, expect, test } from 'bun:test';
import { resolveHubUrl, toHubWsUrl } from '../src/cmd/coder/hub-url';

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
});
