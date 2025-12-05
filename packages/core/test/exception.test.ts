import { describe, test, expect } from 'bun:test';
import { ServiceException } from '../src/services/exception';

describe('ServiceException', () => {
	test('should create exception with required data fields', () => {
		const error = new ServiceException({
			statusCode: 500,
			method: 'GET',
			url: 'https://api.example.com/test',
		});
		expect(error.name).toBe('ServiceException');
		expect(error.statusCode).toBe(500);
		expect(error.method).toBe('GET');
		expect(error.url).toBe('https://api.example.com/test');
		expect(error.sessionId).toBeUndefined();
	});

	test('should create exception with all data fields', () => {
		const error = new ServiceException({
			statusCode: 404,
			method: 'POST',
			url: 'https://api.example.com/users',
			sessionId: 'session-123',
		});
		expect(error.statusCode).toBe(404);
		expect(error.method).toBe('POST');
		expect(error.url).toBe('https://api.example.com/users');
		expect(error.sessionId).toBe('session-123');
	});

	test('should create exception with custom message', () => {
		const error = new ServiceException({
			message: 'Custom error message',
			statusCode: 403,
			method: 'DELETE',
			url: 'https://api.example.com/resource',
		});
		expect(error.message).toBe('Custom error message');
		expect(error.statusCode).toBe(403);
	});

	test('should create exception with cause', () => {
		const cause = new Error('Network timeout');
		const error = new ServiceException({
			message: 'Request failed',
			statusCode: 500,
			method: 'GET',
			url: 'https://api.example.com/data',
			cause,
		});
		expect(error.message).toBe('Request failed');
		expect(error.cause).toBe(cause);
	});

	test('should be instance of Error', () => {
		const error = new ServiceException({
			statusCode: 500,
			method: 'GET',
			url: 'https://api.example.com',
		});
		expect(error instanceof Error).toBe(true);
	});

	test('should preserve stack trace', () => {
		const error = new ServiceException({
			statusCode: 500,
			method: 'GET',
			url: 'https://api.example.com',
		});
		expect(error.stack).toBeDefined();
		expect(error.stack).toContain('ServiceException');
	});

	test('should handle null sessionId', () => {
		const error = new ServiceException({
			statusCode: 401,
			method: 'GET',
			url: 'https://api.example.com/auth',
			sessionId: null,
		});
		expect(error.sessionId).toBeNull();
	});

	test('should handle different HTTP methods', () => {
		const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] as const;
		methods.forEach((method) => {
			const error = new ServiceException({
				statusCode: 500,
				method,
				url: 'https://api.example.com',
			});
			expect(error.method).toBe(method);
		});
	});

	test('should handle different status codes', () => {
		const statusCodes = [400, 401, 403, 404, 500, 502, 503];
		statusCodes.forEach((statusCode) => {
			const error = new ServiceException({
				statusCode,
				method: 'GET',
				url: 'https://api.example.com',
			});
			expect(error.statusCode).toBe(statusCode);
		});
	});

	test('should be throwable and catchable', () => {
		try {
			throw new ServiceException({
				statusCode: 404,
				method: 'GET',
				url: 'https://api.example.com/missing',
			});
		} catch (error) {
			expect(error instanceof Error).toBe(true);
			const serviceError = error as InstanceType<typeof ServiceException>;
			expect(serviceError.statusCode).toBe(404);
			expect(serviceError.url).toBe('https://api.example.com/missing');
		}
	});

	test('should support different URL formats', () => {
		const urls = [
			'https://api.example.com/v1/users',
			'http://localhost:3000/test',
			'/relative/path',
			'https://api.example.com/path?query=value&other=123',
		];

		urls.forEach((url) => {
			const error = new ServiceException({
				statusCode: 500,
				method: 'GET',
				url,
			});
			expect(error.url).toBe(url);
		});
	});

	test('should handle nested exceptions with cause chain', () => {
		const rootCause = new Error('Database connection failed');
		const level1 = new ServiceException({
			message: 'Query execution failed',
			statusCode: 500,
			method: 'POST',
			url: 'https://api.example.com/query',
			cause: rootCause,
		});
		const level2 = new ServiceException({
			message: 'Request failed',
			statusCode: 500,
			method: 'POST',
			url: 'https://api.example.com/request',
			cause: level1,
		});

		expect(level2.cause).toBe(level1);
		expect((level2.cause as InstanceType<typeof ServiceException>).cause).toBe(rootCause);
	});
});
