/**
 * Tests for SSE handler compatibility with async fetch operations.
 *
 * Verifies that the SSE handler correctly handles async operations that
 * consume ReadableStreams internally (like AI SDK's generateText/generateObject).
 *
 * The fix makes the SSE callback fire-and-forget (not awaited by Hono's streamSSE),
 * matching the behavior of the stream() handler.
 *
 * Related to: https://github.com/agentuity/sdk/issues/471
 */

import { test, expect, describe } from 'bun:test';
import { Hono } from 'hono';
import { sse } from '../src/handlers/sse';

/**
 * Helper to read SSE response body as a stream and collect all messages.
 * This properly handles the streaming nature of SSE responses.
 */
async function collectSSEMessages(response: Response, timeoutMs = 2000): Promise<string[]> {
	const messages: string[] = [];

	if (!response.body) {
		return messages;
	}

	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	const startTime = Date.now();

	try {
		while (Date.now() - startTime < timeoutMs) {
			const { done, value } = await reader.read();
			if (done) break;

			const text = decoder.decode(value, { stream: true });
			// Parse SSE messages (split by double newline)
			const parts = text.split('\n\n').filter((p) => p.trim());
			for (const part of parts) {
				const dataLine = part.split('\n').find((l) => l.startsWith('data:'));
				if (dataLine) {
					messages.push(dataLine.slice(5).trim());
				}
			}
		}
	} catch {
		// Stream may be closed, that's ok
	} finally {
		reader.releaseLock();
	}

	return messages;
}

describe('SSE Handler - Async Fetch Compatibility', () => {
	test('SSE handler allows async operations that consume ReadableStreams', async () => {
		const app = new Hono();
		const handlerExecuted: string[] = [];

		app.get(
			'/sse',
			sse(async (_c, stream) => {
				// Simulate what AI SDK's generateText does:
				// 1. Make a fetch request
				// 2. Get a Response with a ReadableStream body
				// 3. Consume the stream to get the result
				const simulateFetch = async (): Promise<string> => {
					// Create a ReadableStream (simulating fetch response body)
					const responseStream = new ReadableStream({
						start(controller) {
							controller.enqueue(new TextEncoder().encode('AI response data'));
							controller.close();
						},
					});

					// Consume the stream (simulating .text() or .json() on fetch response)
					const reader = responseStream.getReader();
					const chunks: Uint8Array[] = [];
					while (true) {
						const { done, value } = await reader.read();
						if (done) break;
						chunks.push(value);
					}

					// Decode and return
					const combined = new Uint8Array(chunks.reduce((acc, c) => acc + c.length, 0));
					let offset = 0;
					for (const chunk of chunks) {
						combined.set(chunk, offset);
						offset += chunk.length;
					}
					return new TextDecoder().decode(combined);
				};

				// This should NOT throw "ReadableStream has already been used"
				const result = await simulateFetch();
				handlerExecuted.push(result);

				// Write result to SSE stream
				await stream.writeSSE({ data: result, event: 'result' });
				stream.close();
			})
		);

		// Make SSE request
		const response = await app.request('/sse');

		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toBe('text/event-stream');

		// Collect SSE messages from the stream
		const messages = await collectSSEMessages(response);

		// Verify the async operation completed and data was written
		expect(messages).toContain('AI response data');
		expect(handlerExecuted).toContain('AI response data');
	});

	test('SSE handler works with multiple sequential async operations', async () => {
		const app = new Hono();

		app.get(
			'/sse-multi',
			sse(async (_c, stream) => {
				// Multiple async operations consuming different streams
				for (let i = 0; i < 3; i++) {
					const responseStream = new ReadableStream({
						start(controller) {
							controller.enqueue(new TextEncoder().encode(`chunk-${i}`));
							controller.close();
						},
					});

					// Consume stream
					const reader = responseStream.getReader();
					const { value } = await reader.read();
					const text = new TextDecoder().decode(value);

					await stream.writeSSE({ data: text, event: 'chunk' });
				}

				stream.close();
			})
		);

		const response = await app.request('/sse-multi');
		expect(response.status).toBe(200);

		const messages = await collectSSEMessages(response);
		expect(messages).toContain('chunk-0');
		expect(messages).toContain('chunk-1');
		expect(messages).toContain('chunk-2');
	});

	test('SSE handler completion tracking works with async operations', async () => {
		const app = new Hono();
		let handlerCompleted = false;

		app.get(
			'/sse-complete',
			sse(async (_c, stream) => {
				// Simulate async work
				await new Promise((resolve) => setTimeout(resolve, 10));
				await stream.writeSSE({ data: 'message' });
				handlerCompleted = true;
				stream.close();
			})
		);

		const response = await app.request('/sse-complete');
		expect(response.status).toBe(200);

		// Read the stream to ensure handler completes
		const messages = await collectSSEMessages(response);
		expect(messages).toContain('message');

		// Handler should have completed
		expect(handlerCompleted).toBe(true);
	});

	test('SSE handler pattern test - fire-and-forget execution', async () => {
		// This test verifies the fire-and-forget pattern works correctly
		// by checking that async operations inside the handler complete
		// without blocking the response creation

		const executionOrder: string[] = [];

		const app = new Hono();

		app.get(
			'/sse-pattern',
			sse(async (_c, stream) => {
				executionOrder.push('handler-start');

				// Simulate async work (like generateText)
				await new Promise((resolve) => setTimeout(resolve, 20));
				executionOrder.push('async-work-done');

				await stream.writeSSE({ data: 'done' });
				executionOrder.push('message-written');

				stream.close();
				executionOrder.push('stream-closed');
			})
		);

		const response = await app.request('/sse-pattern');

		// Response should be available immediately (fire-and-forget)
		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toBe('text/event-stream');

		// But we need to consume the stream to let the handler complete
		const messages = await collectSSEMessages(response);
		expect(messages).toContain('done');

		// Verify execution order
		expect(executionOrder).toEqual([
			'handler-start',
			'async-work-done',
			'message-written',
			'stream-closed',
		]);
	});
});

describe('SSE Handler - Error Handling', () => {
	test('SSE handler errors do not crash the server', async () => {
		const app = new Hono();

		app.get(
			'/sse-error',
			sse(async (_c, stream) => {
				// Write initial message before error
				await stream.writeSSE({ data: 'started' });

				// Simulate an async operation that throws
				await new Promise((resolve) => setTimeout(resolve, 10));
				throw new Error('Simulated async error');
			})
		);

		// Make SSE request - should not throw
		const response = await app.request('/sse-error');

		// Response should be successful (SSE is fire-and-forget)
		expect(response.status).toBe(200);

		// Read whatever was sent before the error
		const messages = await collectSSEMessages(response, 500);
		expect(messages).toContain('started');
	});
});

describe('SSE Handler - Auto-close Behavior', () => {
	test('stream is auto-closed when handler completes without calling close()', async () => {
		const app = new Hono();
		let handlerCompleted = false;

		app.get(
			'/sse-no-close',
			sse(async (_c, stream) => {
				await stream.writeSSE({ data: 'message 1' });
				await stream.writeSSE({ data: 'message 2' });
				handlerCompleted = true;
				// Note: NOT calling stream.close() - should auto-close
			})
		);

		const response = await app.request('/sse-no-close');
		expect(response.status).toBe(200);

		// Stream should complete and return all messages even without explicit close()
		const messages = await collectSSEMessages(response);
		expect(messages).toContain('message 1');
		expect(messages).toContain('message 2');
		expect(handlerCompleted).toBe(true);
	});

	test('stream closes immediately when close() is called explicitly', async () => {
		const app = new Hono();
		const executionOrder: string[] = [];

		app.get(
			'/sse-explicit-close',
			sse(async (_c, stream) => {
				executionOrder.push('before-write');
				await stream.writeSSE({ data: 'message' });
				executionOrder.push('after-write');
				stream.close();
				executionOrder.push('after-close');
			})
		);

		const response = await app.request('/sse-explicit-close');
		expect(response.status).toBe(200);

		const messages = await collectSSEMessages(response);
		expect(messages).toContain('message');
		expect(executionOrder).toEqual(['before-write', 'after-write', 'after-close']);
	});

	test('messages written before handler returns are all received', async () => {
		const app = new Hono();

		app.get(
			'/sse-multiple-messages',
			sse(async (_c, stream) => {
				// Write multiple messages without explicit close
				for (let i = 1; i <= 5; i++) {
					await stream.writeSSE({ data: `message ${i}` });
				}
				// No close() call - rely on auto-close
			})
		);

		const response = await app.request('/sse-multiple-messages');
		expect(response.status).toBe(200);

		const messages = await collectSSEMessages(response);
		expect(messages.length).toBe(5);
		expect(messages).toEqual(['message 1', 'message 2', 'message 3', 'message 4', 'message 5']);
	});
});
