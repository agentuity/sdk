import { describe, test, expect } from 'bun:test';
import type {
	HttpMethod,
	FetchRequest,
	FetchResponse,
	FetchAdapter,
} from '../src/services/adapter';

describe('adapter types', () => {
	test('should define HTTP methods', () => {
		const methods: HttpMethod[] = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
		expect(methods).toContain('GET');
		expect(methods).toContain('POST');
		expect(methods).toContain('PUT');
		expect(methods).toContain('DELETE');
		expect(methods).toContain('PATCH');
	});

	test('should implement FetchAdapter interface', () => {
		const mockAdapter: FetchAdapter = {
			invoke: async <T>(_url: string, _options: FetchRequest): Promise<FetchResponse<T>> => {
				return {
					ok: true,
					data: {} as T,
					response: new Response(),
				};
			},
		};

		expect(typeof mockAdapter.invoke).toBe('function');
	});

	test('should support FetchRequest structure', () => {
		const request: FetchRequest = {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ key: 'value' }),
		};

		expect(request.method).toBe('POST');
		expect(request.headers).toBeDefined();
		expect(request.body).toBeDefined();
	});

	test('should support FetchResponse structure', () => {
		const successResponse: FetchResponse<{ result: string }> = {
			ok: true,
			data: { result: 'success' },
			response: new Response(),
		};

		expect(successResponse.ok).toBe(true);
		expect(successResponse.data.result).toBe('success');

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const errorResponse: FetchResponse<any> = {
			ok: false,
			data: undefined as never,
			response: new Response(null, { status: 500 }),
		};

		expect(errorResponse.ok).toBe(false);
	});
});
