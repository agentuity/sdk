import { describe, expect, it } from 'bun:test';
import { applySessionIdToConnectUrl, HubClient } from '../src/client.ts';

describe('applySessionIdToConnectUrl', () => {
	it('appends sessionId when the URL has no query string', () => {
		expect(applySessionIdToConnectUrl('ws://hub.example/api/ws', 'codesess_abc')).toBe(
			'ws://hub.example/api/ws?sessionId=codesess_abc'
		);
	});

	it('preserves existing query params when appending sessionId', () => {
		const url = 'ws://hub.example/api/ws?origin=tui';
		const result = applySessionIdToConnectUrl(url, 'codesess_abc');
		const parsed = new URL(result);
		expect(parsed.searchParams.get('origin')).toBe('tui');
		expect(parsed.searchParams.get('sessionId')).toBe('codesess_abc');
	});

	it('overwrites a previously assigned sessionId rather than stacking', () => {
		const url = 'ws://hub.example/api/ws?origin=tui&sessionId=codesess_OLD';
		const result = applySessionIdToConnectUrl(url, 'codesess_NEW');
		const parsed = new URL(result);
		expect(parsed.searchParams.get('sessionId')).toBe('codesess_NEW');
		// No duplicate sessionId entries.
		expect(parsed.searchParams.getAll('sessionId')).toHaveLength(1);
		expect(parsed.searchParams.get('origin')).toBe('tui');
	});

	it('returns the same URL when sessionId already matches', () => {
		const url = 'ws://hub.example/api/ws?origin=tui&sessionId=codesess_abc';
		expect(applySessionIdToConnectUrl(url, 'codesess_abc')).toBe(url);
	});

	it('returns the original URL when sessionId is empty', () => {
		const url = 'ws://hub.example/api/ws?origin=tui';
		expect(applySessionIdToConnectUrl(url, '')).toBe(url);
	});

	it('encodes sessionId values that contain reserved characters', () => {
		const url = 'ws://hub.example/api/ws';
		const result = applySessionIdToConnectUrl(url, 'codesess a&b=c');
		const parsed = new URL(result);
		expect(parsed.searchParams.get('sessionId')).toBe('codesess a&b=c');
	});
});

describe('HubClient.setReconnectSessionId', () => {
	function createClient(): HubClient & {
		// Test-only access to the private cached URL.
		lastConnectUrl: string | null;
	} {
		// `lastConnectUrl` is private; cast to read it in tests.
		return new HubClient() as HubClient & { lastConnectUrl: string | null };
	}

	it('is a no-op before connect() (no cached URL yet)', () => {
		const client = createClient();
		client.setReconnectSessionId('codesess_abc');
		expect(client.lastConnectUrl).toBeNull();
	});

	it('appends sessionId to the cached reconnect URL once assigned', () => {
		const client = createClient();
		client.lastConnectUrl = 'ws://hub.example/api/ws?origin=tui';
		client.setReconnectSessionId('codesess_abc');
		const parsed = new URL(client.lastConnectUrl!);
		expect(parsed.searchParams.get('sessionId')).toBe('codesess_abc');
		expect(parsed.searchParams.get('origin')).toBe('tui');
	});

	it('replaces a previously assigned sessionId on subsequent calls', () => {
		const client = createClient();
		client.lastConnectUrl = 'ws://hub.example/api/ws?origin=tui';
		client.setReconnectSessionId('codesess_FIRST');
		client.setReconnectSessionId('codesess_SECOND');
		const parsed = new URL(client.lastConnectUrl!);
		expect(parsed.searchParams.get('sessionId')).toBe('codesess_SECOND');
		expect(parsed.searchParams.getAll('sessionId')).toHaveLength(1);
	});

	it('ignores empty sessionIds', () => {
		const client = createClient();
		client.lastConnectUrl = 'ws://hub.example/api/ws?origin=tui';
		client.setReconnectSessionId('');
		expect(client.lastConnectUrl).toBe('ws://hub.example/api/ws?origin=tui');
	});
});
