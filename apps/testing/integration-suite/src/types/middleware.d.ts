/**
 * Type declarations for custom middleware variables
 * This extends the Hono ContextVariableMap to add our custom types
 */

import type { MockDatabaseClient, MockAuthUser } from '../lib/custom-middleware';

declare module 'hono' {
	interface ContextVariableMap {
		// Database clients
		clickhouseClient?: MockDatabaseClient;
		postgresClient?: MockDatabaseClient;

		// Auth
		authUser?: MockAuthUser;

		// Analytics
		requestId?: string;
		requestCount?: number;

		// App-level custom data
		appLevelData?: string;

		// API-level custom data
		apiLevelData?: string;
	}
}
