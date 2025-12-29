/* eslint-disable @typescript-eslint/no-explicit-any */
import { type Context, Hono, type Schema, type Env as HonoEnv } from 'hono';
import { returnResponse } from './_util';
import type { Env } from './app';

// Re-export both Env types
export type { Env };
export type { HonoEnv };

// Re-export WebSocketConnection from handlers
export type { WebSocketConnection } from './handlers/websocket';

// Module augmentation to add deprecated methods to Hono
// These stubs throw errors with migration instructions
declare module 'hono' {
	interface Hono {
		/**
		 * @deprecated Use the `websocket` middleware instead:
		 * ```typescript
		 * import { websocket } from '@agentuity/runtime';
		 * router.get('/ws', websocket((c, ws) => { ... }));
		 * ```
		 */
		websocket(path: string, ...args: any[]): this;

		/**
		 * @deprecated Use the `sse` middleware instead:
		 * ```typescript
		 * import { sse } from '@agentuity/runtime';
		 * router.get('/events', sse((c, stream) => { ... }));
		 * ```
		 */
		sse(path: string, ...args: any[]): this;

		/**
		 * @deprecated Use the `stream` middleware instead:
		 * ```typescript
		 * import { stream } from '@agentuity/runtime';
		 * router.post('/data', stream((c) => new ReadableStream({ ... })));
		 * ```
		 */
		stream(path: string, ...args: any[]): this;

		/**
		 * @deprecated Use the `cron` middleware instead:
		 * ```typescript
		 * import { cron } from '@agentuity/runtime';
		 * router.post('/job', cron('0 0 * * *', (c) => { ... }));
		 * ```
		 */
		cron(schedule: string, ...args: any[]): this;
	}
}

/**
 * Creates a Hono router with extended methods for Agentuity-specific routing patterns.
 *
 * Standard HTTP methods (get, post, put, delete, patch) are available, plus middleware
 * functions for specialized protocols:
 *
 * - **websocket()** - WebSocket connections (import { websocket } from '@agentuity/runtime')
 * - **sse()** - Server-Sent Events (import { sse } from '@agentuity/runtime')
 * - **stream()** - Streaming responses (import { stream } from '@agentuity/runtime')
 * - **cron()** - Scheduled tasks (import { cron } from '@agentuity/runtime')
 *
 * @template E - Environment type (Hono Env)
 * @template S - Schema type for route definitions
 *
 * @returns Extended Hono router
 *
 * @example
 * ```typescript
 * import { createRouter, websocket, sse, stream, cron } from '@agentuity/runtime';
 *
 * const router = createRouter();
 *
 * // Standard HTTP routes
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
 *
 * // Streaming response
 * router.post('/stream', stream((c) => {
 *   return new ReadableStream({
 *     start(controller) {
 *       controller.enqueue('data\n');
 *       controller.close();
 *     }
 *   });
 * }));
 *
 * // Cron job
 * router.post('/daily', cron('0 0 * * *', (c) => {
 *   return { status: 'complete' };
 * }));
 * ```
 */
export const createRouter = <E extends Env = Env, S extends Schema = Schema>(): Hono<E, S> => {
	const router = new Hono<E, S>();
	// tslint:disable-next-line:no-any no-unused-variable
	// biome-ignore lint:no-any
	const _router = router as any;

	for (const method of ['get', 'put', 'post', 'delete', 'options', 'patch']) {
		const _originalInvoker = _router[method].bind(router);
		_router[method] = (path: string, ...args: any[]) => {
			// Pass through to original Hono - it handles all the complex type inference
			// We'll only wrap the final handler to add our response handling
			if (args.length === 0) {
				return _originalInvoker(path);
			}

			// Find the last function in args - that's the handler (everything else is middleware)
			let handlerIndex = args.length - 1;
			while (handlerIndex >= 0 && typeof args[handlerIndex] !== 'function') {
				handlerIndex--;
			}

			if (handlerIndex < 0) {
				// No handler found, pass through as-is
				return _originalInvoker(path, ...args);
			}

			const handler = args[handlerIndex];

			// Check if this is middleware (2 params: c, next) vs handler (1 param: c)
			if (handler.length === 2) {
				// This is middleware-only, pass through
				return _originalInvoker(path, ...args);
			}

			// Wrap the handler to add our response conversion
			const wrapper = async (c: Context): Promise<Response> => {
				let result = handler(c);
				if (result instanceof Promise) result = await result;
				// If handler returns a Response, return it unchanged
				if (result instanceof Response) return result;
				return returnResponse(c, result);
			};

			// Replace the handler with our wrapper
			const newArgs = [...args];
			newArgs[handlerIndex] = wrapper;

			return _originalInvoker(path, ...newArgs);
		};
	}

	// Deprecated stubs that throw errors with migration instructions
	_router.websocket = (path: string, ..._args: any[]) => {
		throw new Error(
			`router.websocket() is deprecated and has been removed.\n\n` +
				`Migration: Use the websocket middleware instead:\n\n` +
				`  import { createRouter, websocket } from '@agentuity/runtime';\n\n` +
				`  const router = createRouter();\n\n` +
				`  // Before (deprecated):\n` +
				`  // router.websocket('${path}', (c) => (ws) => { ... });\n\n` +
				`  // After:\n` +
				`  router.get('${path}', websocket((c, ws) => {\n` +
				`    ws.onMessage((event) => {\n` +
				`      ws.send('Echo: ' + event.data);\n` +
				`    });\n` +
				`  }));`
		);
	};

	_router.sse = (path: string, ..._args: any[]) => {
		throw new Error(
			`router.sse() is deprecated and has been removed.\n\n` +
				`Migration: Use the sse middleware instead:\n\n` +
				`  import { createRouter, sse } from '@agentuity/runtime';\n\n` +
				`  const router = createRouter();\n\n` +
				`  // Before (deprecated):\n` +
				`  // router.sse('${path}', (c) => async (stream) => { ... });\n\n` +
				`  // After:\n` +
				`  router.get('${path}', sse((c, stream) => {\n` +
				`    stream.writeSSE({ data: 'Hello', event: 'message' });\n` +
				`  }));`
		);
	};

	_router.stream = (path: string, ..._args: any[]) => {
		throw new Error(
			`router.stream() is deprecated and has been removed.\n\n` +
				`Migration: Use the stream middleware instead:\n\n` +
				`  import { createRouter, stream } from '@agentuity/runtime';\n\n` +
				`  const router = createRouter();\n\n` +
				`  // Before (deprecated):\n` +
				`  // router.stream('${path}', (c) => new ReadableStream({ ... }));\n\n` +
				`  // After:\n` +
				`  router.post('${path}', stream((c) => {\n` +
				`    return new ReadableStream({\n` +
				`      start(controller) {\n` +
				`        controller.enqueue('data\\n');\n` +
				`        controller.close();\n` +
				`      }\n` +
				`    });\n` +
				`  }));`
		);
	};

	_router.cron = (schedule: string, ..._args: any[]) => {
		throw new Error(
			`router.cron() is deprecated and has been removed.\n\n` +
				`Migration: Use the cron middleware instead:\n\n` +
				`  import { createRouter, cron } from '@agentuity/runtime';\n\n` +
				`  const router = createRouter();\n\n` +
				`  // Before (deprecated):\n` +
				`  // router.cron('${schedule}', (c) => { ... });\n\n` +
				`  // After:\n` +
				`  router.post('/your-cron-path', cron('${schedule}', (c) => {\n` +
				`    return { status: 'complete' };\n` +
				`  }));`
		);
	};

	return router;
};
