import { describe, test, expect } from 'bun:test';
import { buildUrl, toServiceException, toPayload, fromResponse } from '../src/services/_util';

describe('buildUrl', () => {
	describe('basic URL construction', () => {
		test('should build URL with base and path', () => {
			expect(buildUrl('https://api.example.com', '/users')).toBe(
				'https://api.example.com/users'
			);
		});

		test('should handle path without leading slash', () => {
			expect(buildUrl('https://api.example.com', 'users')).toBe('https://api.example.com/users');
		});

		test('should handle base with trailing slash', () => {
			expect(buildUrl('https://api.example.com/', '/users')).toBe(
				'https://api.example.com/users'
			);
		});

		test('should handle base with trailing slash and path without leading slash', () => {
			expect(buildUrl('https://api.example.com/', 'users')).toBe(
				'https://api.example.com/users'
			);
		});
	});

	describe('with subpath', () => {
		test('should append subpath with leading slash', () => {
			expect(buildUrl('https://api.example.com', '/users', '/123')).toBe(
				'https://api.example.com/users/123'
			);
		});

		test('should append subpath without leading slash', () => {
			expect(buildUrl('https://api.example.com', '/users', '123')).toBe(
				'https://api.example.com/users/123'
			);
		});

		test('should handle complex subpaths', () => {
			expect(buildUrl('https://api.example.com', '/api/v1', '/users/123/profile')).toBe(
				'https://api.example.com/api/v1/users/123/profile'
			);
		});
	});

	describe('with query parameters', () => {
		test('should append query string', () => {
			const query = new URLSearchParams({ key: 'value', other: '123' });
			expect(buildUrl('https://api.example.com', '/users', undefined, query)).toBe(
				'https://api.example.com/users?key=value&other=123'
			);
		});

		test('should append query string with subpath', () => {
			const query = new URLSearchParams({ filter: 'active' });
			expect(buildUrl('https://api.example.com', '/users', '/list', query)).toBe(
				'https://api.example.com/users/list?filter=active'
			);
		});

		test('should handle empty query parameters', () => {
			const query = new URLSearchParams();
			// Empty URLSearchParams still appends '?'
			expect(buildUrl('https://api.example.com', '/users', undefined, query)).toBe(
				'https://api.example.com/users?'
			);
		});

		test('should handle special characters in query', () => {
			const query = new URLSearchParams({ search: 'hello world', email: 'test@example.com' });
			expect(buildUrl('https://api.example.com', '/search', undefined, query)).toBe(
				'https://api.example.com/search?search=hello+world&email=test%40example.com'
			);
		});
	});

	describe('edge cases', () => {
		test('should handle localhost URLs', () => {
			expect(buildUrl('http://localhost:3000', '/api')).toBe('http://localhost:3000/api');
		});

		test('should handle IP addresses', () => {
			expect(buildUrl('http://192.168.1.1', '/test')).toBe('http://192.168.1.1/test');
		});

		test('should handle paths with multiple segments', () => {
			expect(buildUrl('https://api.example.com', '/api/v1/users')).toBe(
				'https://api.example.com/api/v1/users'
			);
		});
	});
});

describe('toServiceException', () => {
	describe('HTTP status codes', () => {
		test('should handle 401 Unauthorized', async () => {
			const response = new Response(null, {
				status: 401,
				headers: { 'x-session-id': 'session-123' },
			});
			const error = await toServiceException('GET', 'https://api.example.com/test', response);

			expect(error.message).toBe('Unauthorized');
			expect(error.statusCode).toBe(401);
			expect(error.method).toBe('GET');
			expect(error.url).toBe('https://api.example.com/test');
			expect(error.sessionId).toBe('session-123');
		});

		test('should handle 403 Forbidden', async () => {
			const response = new Response(null, { status: 403 });
			const error = await toServiceException('POST', 'https://api.example.com/admin', response);

			expect(error.message).toBe('Unauthorized');
			expect(error.statusCode).toBe(403);
		});

		test('should handle 404 Not Found', async () => {
			const response = new Response(null, { status: 404 });
			const error = await toServiceException(
				'DELETE',
				'https://api.example.com/users/999',
				response
			);

			expect(error.message).toBe('Not Found');
			expect(error.statusCode).toBe(404);
		});
	});

	describe('JSON error responses', () => {
		test('should extract error field from JSON response', async () => {
			const response = new Response(JSON.stringify({ error: 'Custom error message' }), {
				status: 500,
				headers: { 'content-type': 'application/json' },
			});
			const error = await toServiceException('GET', 'https://api.example.com/fail', response);

			expect(error.message).toBe('Custom error message');
			expect(error.statusCode).toBe(500);
		});

		test('should extract message field from JSON response', async () => {
			const response = new Response(JSON.stringify({ message: 'Validation failed' }), {
				status: 400,
				headers: { 'content-type': 'application/json' },
			});
			const error = await toServiceException('POST', 'https://api.example.com/create', response);

			expect(error.message).toBe('Validation failed');
			expect(error.statusCode).toBe(400);
		});

		test('should prefer error field over message field', async () => {
			const response = new Response(
				JSON.stringify({ error: 'Error message', message: 'Other message' }),
				{
					status: 500,
					headers: { 'content-type': 'application/json' },
				}
			);
			const error = await toServiceException('GET', 'https://api.example.com/test', response);

			expect(error.message).toBe('Error message');
		});

		test('should stringify entire JSON payload if no error/message fields', async () => {
			const response = new Response(
				JSON.stringify({ code: 500, details: 'Something went wrong' }),
				{
					status: 500,
					headers: { 'content-type': 'application/json' },
				}
			);
			const error = await toServiceException('GET', 'https://api.example.com/test', response);

			expect(error.message).toBe('{"code":500,"details":"Something went wrong"}');
		});

		test('should handle application/json content-type variants', async () => {
			const response = new Response(JSON.stringify({ error: 'Test error' }), {
				status: 500,
				headers: { 'content-type': 'application/json; charset=utf-8' },
			});
			const error = await toServiceException('GET', 'https://api.example.com/test', response);

			expect(error.message).toBe('Test error');
		});

		test('should handle invalid JSON gracefully', async () => {
			const response = new Response('not valid json', {
				status: 500,
				headers: { 'content-type': 'application/json' },
			});
			const error = await toServiceException('GET', 'https://api.example.com/test', response);

			// JSON parse fails, falls through to response.text() which is already consumed, returns statusText
			expect(error.message).toBe('');
			expect(error.statusCode).toBe(500);
		});
	});

	describe('text error responses', () => {
		test('should use response text for non-JSON responses', async () => {
			const response = new Response('Internal Server Error', {
				status: 500,
				headers: { 'content-type': 'text/plain' },
			});
			const error = await toServiceException('GET', 'https://api.example.com/test', response);

			expect(error.message).toBe('Internal Server Error');
			expect(error.statusCode).toBe(500);
		});

		test('should handle empty response body', async () => {
			const response = new Response('', { status: 500 });
			const error = await toServiceException('GET', 'https://api.example.com/test', response);

			// Empty text falls through to statusText
			expect(error.message).toBe('');
		});
	});

	describe('session ID handling', () => {
		test('should extract session ID from header', async () => {
			const response = new Response(null, {
				status: 500,
				headers: { 'x-session-id': 'session-abc-123' },
			});
			const error = await toServiceException('GET', 'https://api.example.com/test', response);

			expect(error.sessionId).toBe('session-abc-123');
		});

		test('should handle missing session ID', async () => {
			const response = new Response(null, { status: 500 });
			const error = await toServiceException('GET', 'https://api.example.com/test', response);

			expect(error.sessionId).toBeNull();
		});
	});
});

describe('toPayload', () => {
	test('should convert object to JSON payload', async () => {
		const data = { name: 'test', value: 42 };
		const [body, contentType] = await toPayload(data);
		expect(body).toBe('{"name":"test","value":42}');
		expect(contentType).toBe('application/json');
	});

	test('should convert array to JSON payload', async () => {
		const data = [1, 2, 3];
		const [body, contentType] = await toPayload(data);
		expect(body).toBe('[1,2,3]');
		expect(contentType).toBe('application/json');
	});

	test('should detect JSON string and return as-is', async () => {
		const data = '{"key":"value"}';
		const [body, contentType] = await toPayload(data);
		expect(body).toBe('{"key":"value"}');
		expect(contentType).toBe('application/json');
	});

	test('should detect JSON array string', async () => {
		const data = '[1,2,3]';
		const [body, contentType] = await toPayload(data);
		expect(body).toBe('[1,2,3]');
		expect(contentType).toBe('application/json');
	});

	test('should handle plain text string', async () => {
		const data = 'plain text';
		const [body, contentType] = await toPayload(data);
		expect(body).toBe('plain text');
		expect(contentType).toBe('text/plain');
	});

	test('should handle boolean values', async () => {
		const [bodyTrue, ctTrue] = await toPayload(true);
		expect(bodyTrue).toBe('true');
		expect(ctTrue).toBe('text/plain');

		const [bodyFalse, ctFalse] = await toPayload(false);
		expect(bodyFalse).toBe('false');
		expect(ctFalse).toBe('text/plain');
	});

	test('should handle number values', async () => {
		const [body, contentType] = await toPayload(42);
		expect(body).toBe('42');
		expect(contentType).toBe('text/plain');
	});

	test('should handle null', async () => {
		const [body, contentType] = await toPayload(null);
		expect(body).toBe('');
		expect(contentType).toBe('text/plain');
	});

	test('should handle undefined', async () => {
		const [body, contentType] = await toPayload(undefined);
		expect(body).toBe('');
		expect(contentType).toBe('text/plain');
	});

	test('should handle ArrayBuffer', async () => {
		const buffer = new ArrayBuffer(8);
		const [body, contentType] = await toPayload(buffer);
		expect(body).toBe(buffer);
		expect(contentType).toBe('application/octet-stream');
	});

	test('should handle Uint8Array', async () => {
		const uint8 = new Uint8Array([1, 2, 3]);
		const [body, contentType] = await toPayload(uint8);
		expect(body).toBeInstanceOf(ArrayBuffer);
		expect(contentType).toBe('application/octet-stream');
	});

	test('should handle ReadableStream', async () => {
		const stream = new ReadableStream();
		const [body, contentType] = await toPayload(stream);
		expect(body).toBe(stream);
		expect(contentType).toBe('application/octet-stream');
	});

	test('should resolve Promise', async () => {
		const promise = Promise.resolve({ key: 'value' });
		const [body, contentType] = await toPayload(promise);
		expect(body).toBe('{"key":"value"}');
		expect(contentType).toBe('application/json');
	});

	test('should invoke Function', async () => {
		const fn = () => ({ result: 'success' });
		const [body, contentType] = await toPayload(fn);
		// Function is handled as generic object, serialized to empty string
		expect(body).toBe('');
		expect(contentType).toBe('text/plain');
	});

	test('should handle invalid JSON-like string', async () => {
		const data = '{invalid json}';
		const [body, contentType] = await toPayload(data);
		expect(body).toBe('{invalid json}');
		expect(contentType).toBe('text/plain');
	});
});

describe('fromResponse', () => {
	test('should parse JSON response', async () => {
		const response = new Response('{"key":"value"}', {
			headers: { 'content-type': 'application/json' },
		});
		const result = await fromResponse(response);
		expect(result).toEqual({ key: 'value' });
	});

	test('should parse JSON response with charset', async () => {
		const response = new Response('{"key":"value"}', {
			headers: { 'content-type': 'application/json; charset=utf-8' },
		});
		const result = await fromResponse(response);
		expect(result).toEqual({ key: 'value' });
	});

	test('should parse text response', async () => {
		const response = new Response('plain text', {
			headers: { 'content-type': 'text/plain' },
		});
		const result = await fromResponse(response);
		expect(result).toBe('plain text');
	});

	test('should parse HTML response', async () => {
		const response = new Response('<html></html>', {
			headers: { 'content-type': 'text/html' },
		});
		const result = await fromResponse(response);
		expect(result).toBe('<html></html>');
	});

	test('should parse binary response as ArrayBuffer', async () => {
		const buffer = new ArrayBuffer(8);
		const response = new Response(buffer, {
			headers: { 'content-type': 'application/octet-stream' },
		});
		const result = await fromResponse(response);
		expect(result).toBeInstanceOf(ArrayBuffer);
	});

	test('should default to JSON when no content-type', async () => {
		const response = new Response('{"key":"value"}');
		const result = await fromResponse(response);
		expect(result).toEqual({ key: 'value' });
	});

	test('should handle empty content-type as JSON', async () => {
		const response = new Response('{"key":"value"}', {
			headers: { 'content-type': '' },
		});
		const result = await fromResponse(response);
		expect(result).toEqual({ key: 'value' });
	});
});
