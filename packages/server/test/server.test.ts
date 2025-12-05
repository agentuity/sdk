import { describe, test, expect, mock } from 'bun:test';
import { createServerFetchAdapter, redact } from '../src/server';
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
});
