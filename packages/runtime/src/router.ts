import { Hono, type Env as HonoEnv, type Schema } from 'hono';
import type { BlankSchema } from 'hono/types';
import type { Env } from './app';

// Re-export both Env types
export type { Env };
export type { HonoEnv };

// Re-export WebSocketConnection from handlers
export type { WebSocketConnection } from './handlers/websocket';

// Module augmentation to extend Hono types for Agentuity runtime
declare module 'hono' {
	// Extend Context with waitUntil for route handlers
	interface Context {
		/**
		 * Schedule a background task that runs after the response is sent.
		 * Works the same as `ctx.waitUntil()` in agent handlers.
		 *
		 * @example
		 * ```typescript
		 * router.post('/data', async (c) => {
		 *   c.waitUntil(async () => {
		 *     await sendAnalytics(c.req.url);
		 *   });
		 *   return c.json({ success: true });
		 * });
		 * ```
		 */
		waitUntil(callback: Promise<void> | (() => void | Promise<void>)): void;
	}
}

/**
 * Creates a Hono router for use with Agentuity.
 *
 * This is a thin wrapper around `new Hono()` that provides the correct
 * Agentuity environment types. Hono's full type inference chain is
 * preserved — the Schema type parameter accumulates route definitions
 * as you chain `.get()`, `.post()`, etc.
 *
 * @template E - Environment type (defaults to Agentuity's Env)
 * @template S - Schema type for route definitions
 *
 * @returns Hono router instance
 *
 * @example
 * ```typescript
 * import { createRouter, websocket, sse, stream, cron } from '@agentuity/runtime';
 *
 * const router = createRouter();
 *
 * // Standard HTTP routes — full type inference
 * router.get('/hello', (c) => c.text('Hello!'));
 * router.post('/data', async (c) => {
 *   const body = await c.req.json();
 *   return c.json({ received: body });
 * });
 *
 * // WebSocket connection
 * router.get('/ws', websocket((c, ws) => {
 *   ws.onMessage((event) => {
 *     ws.send('Echo: ' + event.data);
 *   });
 * }));
 *
 * // Server-Sent Events
 * router.get('/events', sse((c, stream) => {
 *   stream.writeSSE({ data: 'Hello', event: 'message' });
 * }));
 * ```
 */
export const createRouter = <E extends Env = Env, S extends Schema = BlankSchema>(): Hono<E, S> => {
	return new Hono<E, S>();
};
