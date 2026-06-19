import { mock } from 'bun:test';

export interface MockPostgresPoolOptions {
	ended?: boolean;
	shuttingDown?: boolean;
}

export interface MockPostgresPool {
	readonly shuttingDown: boolean;
	readonly ended?: boolean;
	shutdown: ReturnType<typeof mock>;
	close: ReturnType<typeof mock>;
}

/**
 * Create a mock postgres pool/connection for registry and hot-reload tests.
 */
export function createMockPostgresPool(options: MockPostgresPoolOptions = {}): MockPostgresPool {
	return {
		shutdown: mock(() => {}),
		close: mock(() => Promise.resolve()),
		ended: options.ended ?? false,
		shuttingDown: options.shuttingDown ?? false,
	};
}
