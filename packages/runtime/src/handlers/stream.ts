import type { Context, Handler } from 'hono';
import { stream as honoStream } from 'hono/streaming';
import { getAgentAsyncLocalStorage } from '../_context';
import type { Env } from '../app';

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
				} catch (err) {
					c.var.logger?.error('Stream error:', err);
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
