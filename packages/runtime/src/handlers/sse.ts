import type { Context, Handler } from 'hono';
import { stream as honoStream } from 'hono/streaming';
import { context as otelContext, ROOT_CONTEXT } from '@opentelemetry/api';
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
 * Format an SSE message according to the SSE specification.
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events
 */
function formatSSEMessage(message: SSEMessage): string {
	let text = '';
	if (message.event) {
		text += `event: ${message.event}\n`;
	}
	if (message.id) {
		text += `id: ${message.id}\n`;
	}
	if (typeof message.retry === 'number') {
		text += `retry: ${message.retry}\n`;
	}
	// Data can be multiline - each line needs its own "data:" prefix
	const dataLines = message.data.split(/\r?\n/);
	for (const line of dataLines) {
		text += `data: ${line}\n`;
	}
	// SSE messages are terminated by a blank line
	text += '\n';
	return text;
}

/**
 * Creates an SSE (Server-Sent Events) middleware for streaming updates to clients.
 *
 * This implementation uses Hono's stream() helper instead of streamSSE() to ensure
 * compatibility with async operations that consume ReadableStreams internally
 * (like AI SDK's generateText/generateObject). The stream() helper uses a fire-and-forget
 * pattern that avoids "ReadableStream has already been used" errors.
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
 * @see https://github.com/agentuity/sdk/issues/471
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

		// Prevent unhandled rejection warnings if no middleware consumes donePromise.
		// The error is still propagated via the rejection for middleware that awaits it.
		donePromise.catch(() => {
			// Intentionally empty - error is logged in runInContext catch block
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

		// Set SSE-specific headers
		c.header('Content-Type', 'text/event-stream');
		c.header('Cache-Control', 'no-cache');
		c.header('Connection', 'keep-alive');

		// Use honoStream instead of honoStreamSSE.
		// honoStream uses a fire-and-forget async IIFE pattern that returns the Response
		// immediately while the handler runs in the background. This is critical for
		// compatibility with AI SDK's generateText/generateObject which use fetch()
		// internally. With honoStreamSSE, the callback is awaited before returning,
		// which causes "ReadableStream has already been used" errors when fetch
		// response streams are consumed in the same async chain.
		// See: https://github.com/agentuity/sdk/issues/471

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		return honoStream(c, async (s: any) => {
			const encoder = new TextEncoder();

			// Track if user registered an onAbort callback
			let userAbortCallback: (() => void) | undefined;

			// Internal function to write an SSE message
			const writeSSEInternal = async (message: SSEMessage): Promise<void> => {
				const formatted = formatSSEMessage(message);
				await s.write(encoder.encode(formatted));
			};

			const wrappedStream: SSEStream = {
				write: async (data) => {
					if (
						typeof data === 'string' ||
						typeof data === 'number' ||
						typeof data === 'boolean'
					) {
						return writeSSEInternal({ data: String(data) });
					} else if (typeof data === 'object' && data !== null) {
						return writeSSEInternal(data as SSEMessage);
					}
					return writeSSEInternal({ data: String(data) });
				},
				writeSSE: writeSSEInternal,
				onAbort: (callback: () => void) => {
					userAbortCallback = callback;
					s.onAbort(() => {
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
						s.close?.();
					} finally {
						// Mark stream as done on close
						markDone();
					}
				},
			};

			// Always register internal abort handler if user doesn't register one
			// This ensures we track completion even if user doesn't call onAbort
			s.onAbort(() => {
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
					// Log error but don't rethrow - would be unhandled rejection
					c.var.logger?.error?.('SSE handler error:', err);
					markDone(err);
				}
			};

			// Run handler with AsyncLocalStorage context propagation.
			// honoStream already uses a fire-and-forget pattern internally,
			// so we can safely await here - the response is already being sent.
			//
			// IMPORTANT: We run in ROOT_CONTEXT (no active OTEL span) to avoid a Bun bug
			// where OTEL-instrumented fetch conflicts with streaming responses.
			// This causes "ReadableStream has already been used" errors when AI SDK's
			// generateText/generateObject (which use fetch + stream.tee() internally)
			// are called inside SSE handlers. Running without an active span makes
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
