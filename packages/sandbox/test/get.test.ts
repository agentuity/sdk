import { afterEach, describe, expect, test } from 'bun:test';
import type { Logger } from '@agentuity/adapter';
import { APIClient } from '@agentuity/api';
import { sandboxGet } from '../src/get.ts';

const originalFetch = globalThis.fetch;

function createLogger(): Logger {
	const logger: Logger = {
		trace: () => {},
		debug: () => {},
		info: () => {},
		warn: () => {},
		error: () => {},
		fatal: (message: unknown): never => {
			throw new Error(String(message));
		},
		child: () => logger,
	};

	return logger;
}

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe('sandboxGet', () => {
	test('preserves the last sandbox error', async () => {
		globalThis.fetch = async () =>
			new Response(
				JSON.stringify({
					success: true,
					data: {
						sandboxId: 'sandbox-failed',
						status: 'failed',
						createdAt: '2026-07-17T00:00:00Z',
						executions: 0,
						lastError: 'runtime failed to start',
						org: { id: 'org-test', name: 'Test Org' },
					},
				}),
				{ status: 200, headers: { 'content-type': 'application/json' } }
			);

		const client = new APIClient('https://api.example.com', createLogger(), 'test-key');
		const info = await sandboxGet(client, { sandboxId: 'sandbox-failed' });

		expect(info).toMatchObject({ lastError: 'runtime failed to start' });
	});
});
