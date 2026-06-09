import { describe, expect, test, afterEach } from 'bun:test';
import { APIClient, APIError } from '../src/services/api.ts';
import type { Logger } from '../src/logger.ts';

const OriginalFetch = globalThis.fetch;

const logger: Logger = {
	trace: () => {},
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
	fatal: (message?: unknown): never => {
		throw new Error(String(message ?? 'fatal'));
	},
	child: () => logger,
};

describe('APIClient', () => {
	afterEach(() => {
		globalThis.fetch = OriginalFetch;
	});

	test('sets half duplex for streamed raw uploads', async () => {
		let init: RequestInit | undefined;
		globalThis.fetch = ((_input: RequestInfo | URL, requestInit?: RequestInit) => {
			init = requestInit;
			return Promise.resolve(new Response(null, { status: 204 }));
		}) as typeof fetch;

		const client = new APIClient('https://api.example.com', logger);
		const body = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(new Uint8Array([1, 2, 3]));
				controller.close();
			},
		});

		const response = await client.rawPut('/upload', body, 'application/gzip');

		expect(response.status).toBe(204);
		expect(init?.body).toBe(body);
		expect((init as RequestInit & { duplex?: string })?.duplex).toBe('half');
	});

	test('preserves fetch errors for non-retryable streamed uploads', async () => {
		const cause = new TypeError('RequestInit: duplex option is required when sending a body.');
		globalThis.fetch = (() => Promise.reject(cause)) as typeof fetch;

		const client = new APIClient('https://api.example.com', logger);
		const body = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(new Uint8Array([1, 2, 3]));
				controller.close();
			},
		});

		await expect(client.rawPut('/upload', body, 'application/gzip')).rejects.toMatchObject({
			_tag: 'APIErrorResponse',
			message: `Fetch failed: ${cause.message}`,
			status: 0,
			cause,
		});

		await expect(client.rawPut('/upload', body, 'application/gzip')).rejects.toBeInstanceOf(
			APIError
		);
	});
});
