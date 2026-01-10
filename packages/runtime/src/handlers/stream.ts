import type { Context, Handler } from 'hono';
import { stream as honoStream } from 'hono/streaming';
import { context as otelContext, ROOT_CONTEXT } from '@opentelemetry/api';
import { getAgentAsyncLocalStorage } from '../_context';
import type { Env } from '../app';
import { STREAM_DONE_PROMISE_KEY, IS_STREAMING_RESPONSE_KEY } from './sse';

/**
 * Handler function for streaming responses.
 * Returns a ReadableStream that will be piped to the response.
 */
export type StreamHandler<E extends Env = Env> = (
	c: Context<E>
) => ReadableStream<Uint8Array | string> | Promise<ReadableStream<Uint8Array | string>>;

/**
 * Creates a streaming middleware for returning ReadableStream responses.
 *
 * Use with router.post() (or any HTTP method) to create a streaming endpoint:
 *
 * @example
 * ```typescript
 * import { createRouter, stream } from '@agentuity/runtime';
 *
 * const router = createRouter();
 *
 * router.post('/events', stream((c) => {
 *   return new ReadableStream({
 *     start(controller) {
 *       controller.enqueue('event 1\n');
 *       controller.enqueue('event 2\n');
 *       controller.close();
 *     }
 *   });
 * }));
 * ```
 *
 * @example
 * ```typescript
 * // Async stream with data from request body
 * router.post('/process', stream(async (c) => {
 *   const body = await c.req.json();
 *
 *   return new ReadableStream({
 *     async start(controller) {
 *       for (const item of body.items) {
 *         controller.enqueue(`Processing: ${item}\n`);
 *         await new Promise(r => setTimeout(r, 100));
 *       }
 *       controller.close();
 *     }
 *   });
 * }));
 * ```
 *
 * @param handler - Handler function returning a ReadableStream
 * @returns Hono handler for streaming response
 */
export function stream<E extends Env = Env>(handler: StreamHandler<E>): Handler<E> {
	return (c: Context<E>) => {
		const asyncLocalStorage = getAgentAsyncLocalStorage();
		const capturedContext = asyncLocalStorage.getStore();

		// Track stream completion for deferred session/thread saving
		// This promise resolves when the stream completes (pipe finishes or errors)
		let resolveDone: (() => void) | undefined;
		let rejectDone: ((reason?: unknown) => void) | undefined;
		const donePromise = new Promise<void>((resolve, reject) => {
			resolveDone = resolve;
			rejectDone = reject;
		});

		// Idempotent function to mark stream as completed
		let isDone = false;
		const markDone = (error?: unknown) => {
			if (isDone) return;
			isDone = true;
			if (error && rejectDone) {
				rejectDone(error);
			} else if (resolveDone) {
				resolveDone();
			}
		};

		// Expose completion tracking to middleware
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(c as any).set(STREAM_DONE_PROMISE_KEY, donePromise);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(c as any).set(IS_STREAMING_RESPONSE_KEY, true);

		c.header('Content-Type', 'application/octet-stream');

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		return honoStream(c, async (s: any) => {
			const runInContext = async () => {
				try {
					let streamResult = handler(c);
					if (streamResult instanceof Promise) {
						streamResult = await streamResult;
					}
					await s.pipe(streamResult);
					// Stream completed successfully
					markDone();
				} catch (err) {
					c.var.logger?.error('Stream error:', err);
					markDone(err);
					throw err;
				}
			};

			// IMPORTANT: We run in ROOT_CONTEXT (no active OTEL span) to avoid a Bun bug
			// where OTEL-instrumented fetch conflicts with streaming responses.
			// This causes "ReadableStream has already been used" errors when AI SDK's
			// generateText/generateObject (which use fetch + stream.tee() internally)
			// are called inside stream handlers. Running without an active span makes
			// our OTEL fetch wrapper use the original unpatched fetch.
			// See: https://github.com/agentuity/sdk/issues/471
			// See: https://github.com/oven-sh/bun/issues/24766
			await otelContext.with(ROOT_CONTEXT, async () => {
				if (capturedContext) {
					await asyncLocalStorage.run(capturedContext, runInContext);
				} else {
					await runInContext();
				}
			});
		});
	};
}
