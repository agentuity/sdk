import type { Context, Handler } from 'hono';
import { streamSSE as honoStreamSSE } from 'hono/streaming';
import { getAgentAsyncLocalStorage } from '../_context';
import type { Env } from '../app';

/**
 * Context variable key for stream completion promise.
 * Used by middleware to defer session/thread saving until stream completes.
 * @internal
 */
export const STREAM_DONE_PROMISE_KEY = '_streamDonePromise';

/**
 * Context variable key to indicate this is a streaming response.
 * @internal
 */
export const IS_STREAMING_RESPONSE_KEY = '_isStreamingResponse';

/**
 * SSE message format for Server-Sent Events.
 */
export interface SSEMessage {
	data: string;
	event?: string;
	id?: string;
	retry?: number;
}

/**
 * SSE stream interface for writing Server-Sent Events.
 */
export interface SSEStream {
	/**
	 * Write a simple value as SSE data.
	 * Strings, numbers, and booleans are converted to string data.
	 * Objects are passed through as SSE message format.
	 */
	write: (data: string | number | boolean | SSEMessage) => Promise<void>;
	/**
	 * Write a properly formatted SSE message.
	 */
	writeSSE: (message: SSEMessage) => Promise<void>;
	/**
	 * Register a callback for when the client aborts the connection.
	 */
	onAbort: (callback: () => void) => void;
	/**
	 * Close the SSE stream.
	 */
	close: () => void;
}

/**
 * Handler function for SSE connections.
 * Receives the Hono context and SSE stream with a flattened signature.
 */
export type SSEHandler<E extends Env = Env> = (
	c: Context<E>,
	stream: SSEStream
) => void | Promise<void>;

/**
 * Creates an SSE (Server-Sent Events) middleware for streaming updates to clients.
 *
 * Use with router.get() to create an SSE endpoint:
 *
 * @example
 * ```typescript
 * import { createRouter, sse } from '@agentuity/runtime';
 *
 * const router = createRouter();
 *
 * router.get('/events', sse((c, stream) => {
 *   let count = 0;
 *   const interval = setInterval(() => {
 *     stream.writeSSE({
 *       data: `Event ${++count}`,
 *       event: 'update'
 *     });
 *     if (count >= 10) {
 *       clearInterval(interval);
 *       stream.close();
 *     }
 *   }, 1000);
 *
 *   stream.onAbort(() => {
 *     clearInterval(interval);
 *   });
 * }));
 * ```
 *
 * @param handler - Handler function receiving context and SSE stream
 * @returns Hono handler for SSE streaming
 */
export function sse<E extends Env = Env>(handler: SSEHandler<E>): Handler<E> {
	return (c: Context<E>) => {
		const asyncLocalStorage = getAgentAsyncLocalStorage();
		const capturedContext = asyncLocalStorage.getStore();

		// Track stream completion for deferred session/thread saving
		// This promise resolves when the stream closes (normally or via abort)
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

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		return honoStreamSSE(c, async (stream: any) => {
			// Track if user registered an onAbort callback
			let userAbortCallback: (() => void) | undefined;

			const wrappedStream: SSEStream = {
				write: async (data) => {
					if (
						typeof data === 'string' ||
						typeof data === 'number' ||
						typeof data === 'boolean'
					) {
						return stream.writeSSE({ data: String(data) });
					} else if (typeof data === 'object' && data !== null) {
						return stream.writeSSE(data);
					}
					return stream.writeSSE({ data: String(data) });
				},
				writeSSE: stream.writeSSE.bind(stream),
				onAbort: (callback: () => void) => {
					userAbortCallback = callback;
					stream.onAbort(() => {
						try {
							callback();
						} finally {
							// Mark stream as done on abort
							markDone();
						}
					});
				},
				close: () => {
					try {
						stream.close?.();
					} finally {
						// Mark stream as done on close
						markDone();
					}
				},
			};

			// Always register internal abort handler if user doesn't register one
			// This ensures we track completion even if user doesn't call onAbort
			stream.onAbort(() => {
				if (!userAbortCallback) {
					// Only mark done if user didn't register their own handler
					// (their handler wrapper already calls markDone)
					markDone();
				}
			});

			const runInContext = async () => {
				try {
					await handler(c, wrappedStream);
					markDone();
				} catch (err) {
					markDone(err);
					throw err;
				}
			};

			if (capturedContext) {
				await asyncLocalStorage.run(capturedContext, runInContext);
			} else {
				await runInContext();
			}
		});
	};
}
