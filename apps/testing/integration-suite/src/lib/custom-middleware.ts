/**
 * Custom middleware helpers for testing
 * Simulates real-world middleware like database clients, auth, etc.
 */

import type { MiddlewareHandler } from 'hono';

// Simulate a database client
export interface MockDatabaseClient {
	query: (sql: string) => Promise<{ rows: any[] }>;
	connected: boolean;
}

// Simulate an auth user
export interface MockAuthUser {
	id: string;
	email: string;
	role: string;
}

/**
 * Middleware that adds a mock database client (simulates ClickHouse, Postgres, etc.)
 */
export function mockDatabaseMiddleware(name: string): MiddlewareHandler {
	return async (c, next) => {
		const client: MockDatabaseClient = {
			connected: true,
			query: async (sql: string) => {
				return {
					rows: [
						{
							id: 1,
							source: name,
							query: sql,
							timestamp: new Date().toISOString(),
						},
					],
				};
			},
		};

		c.set(`${name}Client` as any, client);
		await next();
	};
}

/**
 * Middleware that adds mock auth (simulates Clerk, Auth0, etc.)
 */
export function mockAuthMiddleware(): MiddlewareHandler {
	return async (c, next) => {
		const user: MockAuthUser = {
			id: 'user-123',
			email: 'test@example.com',
			role: 'admin',
		};

		c.set('authUser' as any, user);
		await next();
	};
}

/**
 * Middleware that adds a custom header to all responses
 */
export function customHeaderMiddleware(headerName: string, headerValue: string): MiddlewareHandler {
	return async (c, next) => {
		await next();
		c.res.headers.set(headerName, headerValue);
	};
}

/**
 * Middleware that tracks request count (simulates analytics)
 */
let requestCount = 0;

export function analyticsMiddleware(): MiddlewareHandler {
	return async (c, next) => {
		requestCount++;
		c.set('requestId' as any, `req-${requestCount}`);
		c.set('requestCount' as any, requestCount);
		await next();
	};
}

export function getRequestCount(): number {
	return requestCount;
}

export function resetRequestCount(): void {
	requestCount = 0;
}
