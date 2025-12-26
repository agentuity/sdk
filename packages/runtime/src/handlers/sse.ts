import type { Context, Handler } from 'hono';
import { streamSSE as honoStreamSSE } from 'hono/streaming';
import { getAgentAsyncLocalStorage } from '../_context';
import type { Env } from '../app';

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

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		return honoStreamSSE(c, async (stream: any) => {
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
				onAbort: stream.onAbort.bind(stream),
				close: stream.close?.bind(stream) ?? (() => {}),
			};

			const runInContext = async () => {
				await handler(c, wrappedStream);
			};

			if (capturedContext) {
				await asyncLocalStorage.run(capturedContext, runInContext);
			} else {
				await runInContext();
			}
		});
	};
}
