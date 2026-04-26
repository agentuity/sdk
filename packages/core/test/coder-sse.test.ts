import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { CoderSSEClient, streamCoderSessionSSE } from '../src/services/coder/sse.ts';

const OriginalFetch = globalThis.fetch;

class MockSSEConnection {
	static instances: MockSSEConnection[] = [];

	readonly url: string;
	readonly init?: RequestInit;
	readonly response: Response;
	closed = false;
	#controller!: ReadableStreamDefaultController<Uint8Array>;
	#encoder = new TextEncoder();

	constructor(url: string, init?: RequestInit, status = 200, statusText = 'OK') {
		this.url = url;
		this.init = init;

		const stream = new ReadableStream<Uint8Array>({
			start: (controller) => {
				this.#controller = controller;
			},
			cancel: () => {
				this.closed = true;
			},
		});

		this.response = new Response(stream, {
			status,
			statusText,
			headers: {
				'content-type': 'text/event-stream',
			},
		});
		MockSSEConnection.instances.push(this);
	}

	emit(eventName: string, payload: unknown) {
		this.#controller.enqueue(
			this.#encoder.encode(`event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`)
		);
	}

	close() {
		this.closed = true;
		try {
			this.#controller.close();
		} catch {
			// Already closed or aborted.
		}
	}

	abort() {
		this.closed = true;
		try {
			this.#controller.error(new DOMException('Aborted', 'AbortError'));
		} catch {
			// Already closed or aborted.
		}
	}

	fail(error = new Error('SSE stream failed')) {
		this.closed = true;
		try {
			this.#controller.error(error);
		} catch {
			// Already closed or aborted.
		}
	}
}

function installMockFetch(status = 200, statusText = 'OK') {
	globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
		const connection = new MockSSEConnection(String(input), init, status, statusText);
		const signal = init?.signal;
		if (signal?.aborted) {
			connection.abort();
			return Promise.reject(new DOMException('Aborted', 'AbortError'));
		}
		signal?.addEventListener('abort', () => connection.abort(), { once: true });
		return Promise.resolve(connection.response);
	}) as typeof fetch;
}

async function flushAsyncWork() {
	await Promise.resolve();
	await Promise.resolve();
	await new Promise((resolve) => setTimeout(resolve, 0));
}

async function waitFor(predicate: () => boolean, timeoutMs = 250) {
	const start = Date.now();
	while (!predicate()) {
		if (Date.now() - start > timeoutMs) {
			throw new Error('Timed out waiting for condition');
		}
		await new Promise((resolve) => setTimeout(resolve, 1));
	}
}

function makeMessageUpdate(sessionId: string, delta = 'hello from SSE') {
	return {
		type: 'broadcast',
		event: 'message_update',
		data: {
			assistantMessageEvent: {
				type: 'text_delta',
				delta,
			},
		},
		category: 'streaming',
		sessionId,
		timestamp: Date.now(),
	};
}

describe('Coder SSE observer clients', () => {
	beforeEach(() => {
		MockSSEConnection.instances = [];
		installMockFetch();
	});

	afterEach(() => {
		globalThis.fetch = OriginalFetch;
		MockSSEConnection.instances = [];
	});

	it('uses default observer subscriptions unless explicit filters are provided', async () => {
		let openCount = 0;
		const client = new CoderSSEClient({
			apiKey: 'ag_test',
			orgId: 'org_test',
			url: 'https://hub.example',
			sessionId: 'codesess_sse_default',
			reconnect: false,
			onOpen: () => {
				openCount += 1;
			},
		});

		client.connect();
		await flushAsyncWork();

		const connection = MockSSEConnection.instances[0];
		expect(connection).toBeDefined();
		expect(decodeURIComponent(connection!.url)).toContain(
			'/api/hub/session/codesess_sse_default/events'
		);
		expect(decodeURIComponent(connection!.url)).toContain('api_key=ag_test');
		expect(decodeURIComponent(connection!.url)).toContain('org_id=org_test');
		expect(decodeURIComponent(connection!.url)).not.toContain('subscribe=');
		expect(connection!.init?.headers).toEqual({ accept: 'text/event-stream' });
		expect(client.state).toBe('connected');
		expect(openCount).toBe(1);

		client.close();
	});

	it('dispatches Hub named broadcast SSE events to class client callbacks', async () => {
		const seenEvents: Array<{ event: string; data: unknown }> = [];
		const broadcasts: unknown[] = [];
		const client = new CoderSSEClient({
			url: 'https://hub.example',
			sessionId: 'codesess_sse_client',
			subscribe: ['*'],
			reconnect: false,
			onEvent: (event) => {
				seenEvents.push(event);
			},
			onBroadcast: (event) => {
				broadcasts.push(event);
			},
		});

		client.connect();
		await flushAsyncWork();

		const connection = MockSSEConnection.instances[0];
		expect(connection).toBeDefined();
		connection!.emit(
			'message_update',
			makeMessageUpdate('codesess_sse_client', 'hello from named SSE')
		);
		await flushAsyncWork();

		expect(seenEvents).toHaveLength(1);
		expect(seenEvents[0]).toMatchObject({
			event: 'message_update',
			data: {
				type: 'broadcast',
				event: 'message_update',
				category: 'streaming',
				sessionId: 'codesess_sse_client',
			},
		});
		expect(broadcasts).toHaveLength(1);

		client.close();
	});

	it('streams Hub named broadcast SSE events when explicit raw-event subscriptions are requested', async () => {
		const eventsPromise = (async () => {
			const seen = [];
			for await (const event of streamCoderSessionSSE({
				url: 'https://hub.example',
				sessionId: 'codesess_sse_stream',
				subscribe: ['*'],
				reconnect: false,
			})) {
				seen.push(event);
				break;
			}
			return seen;
		})();

		await flushAsyncWork();

		const connection = MockSSEConnection.instances[0];
		expect(connection).toBeDefined();
		expect(decodeURIComponent(connection!.url)).toContain('subscribe=*');

		connection!.emit('message_update', makeMessageUpdate('codesess_sse_stream'));

		const events = await eventsPromise;
		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({
			event: 'message_update',
			data: {
				type: 'broadcast',
				event: 'message_update',
				category: 'streaming',
				sessionId: 'codesess_sse_stream',
			},
		});
		expect(connection!.closed).toBe(true);
	});

	it('retries async iterator streams after transient fetch failures', async () => {
		let fetchCalls = 0;
		globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
			fetchCalls += 1;
			if (fetchCalls === 1) {
				return Promise.reject(new TypeError('network unavailable'));
			}
			const connection = new MockSSEConnection(String(input), init);
			return Promise.resolve(connection.response);
		}) as typeof fetch;

		const eventsPromise = (async () => {
			const seen = [];
			for await (const event of streamCoderSessionSSE({
				url: 'https://hub.example',
				sessionId: 'codesess_sse_fetch_retry',
				subscribe: ['*'],
				reconnectDelayMs: 1,
				maxReconnectDelayMs: 1,
				maxReconnectAttempts: 2,
			})) {
				seen.push(event);
				break;
			}
			return seen;
		})();

		await waitFor(() => fetchCalls >= 2 && MockSSEConnection.instances.length === 1);
		MockSSEConnection.instances[0]!.emit(
			'message_update',
			makeMessageUpdate('codesess_sse_fetch_retry')
		);

		const events = await eventsPromise;
		expect(fetchCalls).toBe(2);
		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({
			event: 'message_update',
			data: {
				type: 'broadcast',
				event: 'message_update',
				sessionId: 'codesess_sse_fetch_retry',
			},
		});
	});

	it('retries async iterator streams after retryable HTTP responses', async () => {
		let fetchCalls = 0;
		globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
			fetchCalls += 1;
			if (fetchCalls === 1) {
				return Promise.resolve(new Response('retry later', { status: 503 }));
			}
			const connection = new MockSSEConnection(String(input), init);
			return Promise.resolve(connection.response);
		}) as typeof fetch;

		const eventsPromise = (async () => {
			const seen = [];
			for await (const event of streamCoderSessionSSE({
				url: 'https://hub.example',
				sessionId: 'codesess_sse_http_retry',
				subscribe: ['*'],
				reconnectDelayMs: 1,
				maxReconnectDelayMs: 1,
				maxReconnectAttempts: 2,
			})) {
				seen.push(event);
				break;
			}
			return seen;
		})();

		await waitFor(() => fetchCalls >= 2 && MockSSEConnection.instances.length === 1);
		MockSSEConnection.instances[0]!.emit(
			'message_update',
			makeMessageUpdate('codesess_sse_http_retry')
		);

		const events = await eventsPromise;
		expect(fetchCalls).toBe(2);
		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({
			event: 'message_update',
			data: {
				type: 'broadcast',
				event: 'message_update',
				sessionId: 'codesess_sse_http_retry',
			},
		});
	});

	it('retries async iterator streams after reader failures', async () => {
		const eventsPromise = (async () => {
			const seen = [];
			for await (const event of streamCoderSessionSSE({
				url: 'https://hub.example',
				sessionId: 'codesess_sse_read_retry',
				subscribe: ['*'],
				reconnectDelayMs: 1,
				maxReconnectDelayMs: 1,
				maxReconnectAttempts: 2,
			})) {
				seen.push(event);
				break;
			}
			return seen;
		})();

		await waitFor(() => MockSSEConnection.instances.length === 1);
		MockSSEConnection.instances[0]!.fail(new Error('socket reset'));
		await waitFor(() => MockSSEConnection.instances.length === 2);
		MockSSEConnection.instances[1]!.emit(
			'message_update',
			makeMessageUpdate('codesess_sse_read_retry')
		);

		const events = await eventsPromise;
		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({
			event: 'message_update',
			data: {
				type: 'broadcast',
				event: 'message_update',
				sessionId: 'codesess_sse_read_retry',
			},
		});
	});

	it('does not retry async iterator streams after non-retryable auth responses', async () => {
		let fetchCalls = 0;
		globalThis.fetch = (() => {
			fetchCalls += 1;
			return Promise.resolve(new Response('unauthorized', { status: 401 }));
		}) as typeof fetch;

		const error = await (async () => {
			try {
				for await (const _event of streamCoderSessionSSE({
					url: 'https://hub.example',
					sessionId: 'codesess_sse_auth_failure',
					reconnectDelayMs: 1,
					maxReconnectDelayMs: 1,
					maxReconnectAttempts: 2,
				})) {
					// The stream should fail before yielding.
				}
				return null;
			} catch (err) {
				return err;
			}
		})();

		expect(fetchCalls).toBe(1);
		expect(error).toMatchObject({
			code: 'auth_failed',
			sessionId: 'codesess_sse_auth_failure',
		});
	});
});
