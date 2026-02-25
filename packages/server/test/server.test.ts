import { describe, test, expect, mock } from 'bun:test';
import { createServerFetchAdapter, redact } from '../src/server.ts';
import { createMockLogger, mockFetch } from '@agentuity/test-utils';

describe('redact', () => {
	test('should redact middle of string', () => {
		expect(redact('1234567890')).toBe('1234**7890');
		expect(redact('abcdefghij', 2, 2)).toBe('ab******ij');
	});

	test('should fully redact short strings', () => {
		expect(redact('12345678', 4, 4)).toBe('********');
	});

	test('should handle empty string', () => {
		expect(redact('')).toBe('');
	});
});

describe('createServerFetchAdapter', () => {
	test('should create adapter instance', () => {
		const adapter = createServerFetchAdapter({ headers: {} }, createMockLogger());
		expect(adapter).toBeDefined();
	});

	test('should invoke fetch successfully', async () => {
		mockFetch(
			async () =>
				new Response(JSON.stringify({ result: 'success' }), {
					status: 200,
					headers: { 'content-type': 'application/json' },
				})
		);

		const adapter = createServerFetchAdapter(
			{ headers: { 'X-Custom': 'value' } },
			createMockLogger()
		);

		const response = await adapter.invoke('https://api.example.com/test', {
			method: 'POST',
		});

		expect(response.ok).toBe(true);
		expect(response.data).toEqual({ result: 'success' });
	});

	test('should handle 204 No Content', async () => {
		mockFetch(async () => new Response(null, { status: 204 }));

		const adapter = createServerFetchAdapter({ headers: {} }, createMockLogger());
		const response = await adapter.invoke('https://api.example.com/test', {
			method: 'DELETE',
		});

		expect(response.ok).toBe(true);
		expect(response.data).toBeUndefined();
	});

	test('should handle 404 Not Found', async () => {
		mockFetch(async () => new Response(null, { status: 404 }));

		const adapter = createServerFetchAdapter({ headers: {} }, createMockLogger());
		const response = await adapter.invoke('https://api.example.com/missing', {
			method: 'GET',
		});

		expect(response.ok).toBe(false);
	});

	test('should call onBefore and onAfter hooks', async () => {
		mockFetch(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));

		const onBefore = mock(async (_url, _options, invoke) => {
			await invoke();
		});
		const onAfter = mock(async () => {});

		const adapter = createServerFetchAdapter(
			{ headers: {}, onBefore, onAfter },
			createMockLogger()
		);

		await adapter.invoke('https://api.example.com/test', { method: 'GET' });

		expect(onBefore).toHaveBeenCalled();
		expect(onAfter).toHaveBeenCalled();
	});

	test('should append queryParams to URL', async () => {
		let capturedUrl = '';
		mockFetch(async (url) => {
			capturedUrl = url;
			return new Response(JSON.stringify({ result: 'success' }), {
				status: 200,
				headers: { 'content-type': 'application/json' },
			});
		});

		const adapter = createServerFetchAdapter(
			{
				headers: { Authorization: 'Bearer test' },
				queryParams: { orgId: 'org_123', foo: 'bar' },
			},
			createMockLogger()
		);

		await adapter.invoke('https://api.example.com/endpoint', { method: 'GET' });

		// Verify query params were appended to URL
		expect(capturedUrl).toContain('orgId=org_123');
		expect(capturedUrl).toContain('foo=bar');
		expect(capturedUrl).toContain('?');
	});

	test('should append queryParams to URL that already has query string', async () => {
		let capturedUrl = '';
		mockFetch(async (url) => {
			capturedUrl = url;
			return new Response(JSON.stringify({ result: 'success' }), {
				status: 200,
				headers: { 'content-type': 'application/json' },
			});
		});

		const adapter = createServerFetchAdapter(
			{
				headers: {},
				queryParams: { orgId: 'org_456' },
			},
			createMockLogger()
		);

		await adapter.invoke('https://api.example.com/endpoint?existing=param', { method: 'GET' });

		// Verify both existing and new query params are present
		expect(capturedUrl).toContain('existing=param');
		expect(capturedUrl).toContain('orgId=org_456');
	});

	test('should not modify URL when queryParams is undefined', async () => {
		let capturedUrl = '';
		mockFetch(async (url) => {
			capturedUrl = url;
			return new Response(JSON.stringify({ result: 'success' }), {
				status: 200,
				headers: { 'content-type': 'application/json' },
			});
		});

		const adapter = createServerFetchAdapter({ headers: {} }, createMockLogger());

		await adapter.invoke('https://api.example.com/endpoint', { method: 'GET' });

		// URL should remain unchanged
		expect(capturedUrl).toBe('https://api.example.com/endpoint');
	});

	test('should not modify URL when queryParams is empty object', async () => {
		let capturedUrl = '';
		mockFetch(async (url) => {
			capturedUrl = url;
			return new Response(JSON.stringify({ result: 'success' }), {
				status: 200,
				headers: { 'content-type': 'application/json' },
			});
		});

		const adapter = createServerFetchAdapter(
			{ headers: {}, queryParams: {} },
			createMockLogger()
		);

		await adapter.invoke('https://api.example.com/endpoint', { method: 'GET' });

		// URL should remain unchanged (no query string added)
		expect(capturedUrl).toBe('https://api.example.com/endpoint');
	});
});
