import { describe, test, expect, mock } from 'bun:test';
import { APIClient, APIError, ValidationInputError, ValidationOutputError } from '../src/api/api';
import { createMockLogger, mockFetch } from '@agentuity/test-utils';

describe('APIClient', () => {
	test('should create client with apiKey', () => {
		const client = new APIClient('https://api.example.com', createMockLogger(), 'test-api-key');
		expect(client).toBeDefined();
	});

	test('should make request', async () => {
		mockFetch(
			async () =>
				new Response(JSON.stringify({ data: 'test' }), {
					status: 200,
					headers: { 'content-type': 'application/json' },
				})
		);

		const client = new APIClient('https://api.example.com', createMockLogger(), 'test-key');

		await client.request('GET', '/endpoint');
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		expect(globalThis.fetch as any).toHaveBeenCalled();
	});

	test('should include authorization header', async () => {
		mockFetch(async (_url, opts) => {
			const headers = (opts?.headers ?? {}) as Record<string, string>;
			expect(headers.Authorization).toBe('Bearer test-key');
			return new Response(JSON.stringify({}), { status: 200 });
		});

		const client = new APIClient('https://api.example.com', createMockLogger(), 'test-key');

		await client.request('GET', '/test');
	});

	test('should handle 404 responses', async () => {
		mockFetch(async () => new Response(null, { status: 404 }));

		const client = new APIClient('https://api.example.com', createMockLogger(), 'test-key');

		await expect(client.request('GET', '/missing')).rejects.toThrow();
	});

	test('should make POST with body', async () => {
		const bodyCheck = mock(async (_url, opts) => {
			const body = (opts?.body ?? '') as string;
			expect(body).toContain('name');
			return new Response(JSON.stringify({ result: 'created' }), { status: 201 });
		});

		mockFetch(bodyCheck);

		const client = new APIClient('https://api.example.com', createMockLogger(), 'test-key');

		await client.request('POST', '/create', undefined, { name: 'test' });
	});
});

describe('Error types', () => {
	test('should create APIError', () => {
		const error = new APIError({
			url: 'https://api.example.com/test',
			status: 500,
		});

		expect(error.name).toBe('APIErrorResponse');
		expect(error.url).toBe('https://api.example.com/test');
		expect(error.status).toBe(500);
	});

	test('should create ValidationInputError', () => {
		const error = new ValidationInputError({
			url: 'https://api.example.com/create',
			issues: [{ code: 'invalid_type', path: ['name'], message: 'Expected string' }],
		});

		expect(error.name).toBe('ValidationInputError');
		expect(error.issues).toHaveLength(1);
	});

	test('should create ValidationOutputError', () => {
		const error = new ValidationOutputError({
			url: 'https://api.example.com/test',
			issues: [{ code: 'invalid_type', path: ['result'], message: 'Expected number' }],
		});

		expect(error.name).toBe('ValidationOutputError');
	});
});
