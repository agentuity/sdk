/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-empty-object-type */
import {
	type Context,
	Hono,
	type Input,
	type MiddlewareHandler,
	type Schema,
	type Env as HonoEnv,
} from 'hono';
import { stream as honoStream, streamSSE as honoStreamSSE } from 'hono/streaming';
import { upgradeWebSocket as honoUpgradeWebSocket } from 'hono/bun';
import { hash, returnResponse } from './_util';
import type { Env } from './app';
import { getAgentAsyncLocalStorage } from './_context';
import { parseEmail, type Email } from './io/email';

// Re-export both Env types
export type { Env };
export type { HonoEnv };

type AgentHandler<E extends Env = Env, P extends string = string, I extends Input = {}> = (
	c: Context<E, P, I>
) => any | Promise<any>;

type EmailHandler<E extends Env = Env, P extends string = string, I extends Input = {}> = (
	email: Email,
	c: Context<E, P, I>
) => any | Promise<any>;

type StreamHandler<E extends Env = Env, P extends string = string, I extends Input = {}> = (
	c: Context<E, P, I>
) => ReadableStream<any> | Promise<ReadableStream<any>>;

export interface WebSocketConnection {
	onOpen: (handler: (event: any) => void | Promise<void>) => void;
	onMessage: (handler: (event: any) => void | Promise<void>) => void;
	onClose: (handler: (event: any) => void | Promise<void>) => void;
	send: (data: string | ArrayBuffer | Uint8Array) => void;
}

type WebSocketHandler<E extends Env = Env, P extends string = string, I extends Input = {}> = (
	c: Context<E, P, I>
) => (ws: WebSocketConnection) => void | Promise<void>;

type SSEHandler<E extends Env = Env, P extends string = string, I extends Input = {}> = (
	c: Context<E, P, I>
) => (stream: any) => void | Promise<void>;

// Module augmentation to add custom methods to Hono
// This avoids wrapper types and type instantiation depth issues
// Use simplified signatures to avoid type instantiation depth issues
declare module 'hono' {
	interface Hono {
		/**
		 * Register a route to handle incoming emails at a specific address.
		 *
		 * @param address - The email address to handle (e.g., 'support@example.com')
		 * @param handler - Handler function receiving parsed email and context
		 *
		 * @example
		 * ```typescript
		 * router.email('support@example.com', (email, c) => {
		 *   console.log('From:', email.fromEmail());
		 *   console.log('Subject:', email.subject());
		 *   console.log('Body:', email.text());
		 *   return c.text('Email received');
		 * });
		 * ```
		 */
		email(address: string, handler: (email: Email, c: Context) => any): this;

		/**
		 * Register a route to handle incoming emails with middleware.
		 *
		 * @param address - The email address to handle
		 * @param middleware - Middleware to run before the handler
		 * @param handler - Handler function receiving parsed email and context
		 *
		 * @example
		 * ```typescript
		 * router.email('support@example.com', authMiddleware, (email, c) => {
		 *   return c.json({ received: email.subject() });
		 * });
		 * ```
		 */
		email(
			address: string,
			middleware: MiddlewareHandler,
			handler: (email: Email, c: Context) => any
		): this;

		/**
		 * Register a route to handle incoming SMS messages to a phone number.
		 *
		 * @param params - Configuration object with phone number
		 * @param params.number - Phone number to handle (e.g., '+1234567890')
		 * @param handler - Handler function receiving context
		 *
		 * @example
		 * ```typescript
		 * router.sms({ number: '+1234567890' }, (c) => {
		 *   const message = c.req.query('message');
		 *   console.log('SMS received:', message);
		 *   return c.text('SMS received');
		 * });
		 * ```
		 */
		sms(params: { number: string }, handler: (c: Context) => any): this;

		/**
		 * Schedule a handler to run at specific intervals using cron syntax.
		 *
		 * @param schedule - Cron expression (e.g., '0 0 * * *' for daily at midnight)
		 * @param handler - Handler function to run on schedule
		 *
		 * @example
		 * ```typescript
		 * // Run daily at midnight
		 * router.cron('0 0 * * *', (c) => {
		 *   console.log('Daily cleanup running');
		 *   return c.text('Cleanup complete');
		 * });
		 *
		 * // Run every hour
		 * router.cron('0 * * * *', (c) => {
		 *   console.log('Hourly health check');
		 *   return c.text('OK');
		 * });
		 * ```
		 */
		cron(schedule: string, handler: (c: Context) => any): this;

		/**
		 * Create a streaming route that returns a ReadableStream.
		 *
		 * @param path - The route path
		 * @param handler - Handler returning a ReadableStream
		 *
		 * @example
		 * ```typescript
		 * router.stream('/events', (c) => {
		 *   return new ReadableStream({
		 *     start(controller) {
		 *       controller.enqueue('event 1\n');
		 *       controller.enqueue('event 2\n');
		 *       controller.close();
		 *     }
		 *   });
		 * });
		 * ```
		 */
		stream(
			path: string,
			handler: (c: Context) => ReadableStream<any> | Promise<ReadableStream<any>>
		): this;

		/**
		 * Create a streaming route with middleware.
		 *
		 * @param path - The route path
		 * @param middleware - Middleware to run before streaming
		 * @param handler - Handler returning a ReadableStream
		 *
		 * @example
		 * ```typescript
		 * router.stream('/protected-stream', authMiddleware, (c) => {
		 *   return new ReadableStream({
		 *     start(controller) {
		 *       controller.enqueue('secure data\n');
		 *       controller.close();
		 *     }
		 *   });
		 * });
		 * ```
		 */
		stream(
			path: string,
			middleware: MiddlewareHandler,
			handler: (c: Context) => ReadableStream<any> | Promise<ReadableStream<any>>
		): this;

		/**
		 * Create a WebSocket route for real-time bidirectional communication.
		 *
		 * @param path - The route path
		 * @param handler - Setup function that registers WebSocket event handlers
		 *
		 * @example
		 * ```typescript
		 * router.websocket('/ws', (c) => (ws) => {
		 *   ws.onOpen((event) => {
		 *     console.log('WebSocket opened');
		 *     ws.send('Welcome!');
		 *   });
		 *
		 *   ws.onMessage((event) => {
		 *     console.log('Received:', event.data);
		 *     ws.send('Echo: ' + event.data);
		 *   });
		 *
		 *   ws.onClose((event) => {
		 *     console.log('WebSocket closed');
		 *   });
		 * });
		 * ```
		 */
		websocket(path: string, handler: (c: Context) => (ws: WebSocketConnection) => void): this;

		/**
		 * Create a WebSocket route with middleware.
		 *
		 * @param path - The route path
		 * @param middleware - Middleware to run before WebSocket upgrade
		 * @param handler - Setup function that registers WebSocket event handlers
		 *
		 * @example
		 * ```typescript
		 * router.websocket('/ws', authMiddleware, (c) => (ws) => {
		 *   ws.onMessage((event) => {
		 *     ws.send('Authenticated echo: ' + event.data);
		 *   });
		 * });
		 * ```
		 */
		websocket(
			path: string,
			middleware: MiddlewareHandler,
			handler: (c: Context) => (ws: WebSocketConnection) => void
		): this;

		/**
		 * Create a Server-Sent Events (SSE) route for streaming updates to clients.
		 *
		 * @param path - The route path
		 * @param handler - Handler receiving SSE stream writer
		 *
		 * @example
		 * ```typescript
		 * router.sse('/notifications', (c) => async (stream) => {
		 *   let count = 0;
		 *   const interval = setInterval(() => {
		 *     stream.writeSSE({
		 *       data: `Notification ${++count}`,
		 *       event: 'notification'
		 *     });
		 *     if (count >= 10) {
		 *       clearInterval(interval);
		 *       stream.close();
		 *     }
		 *   }, 1000);
		 * });
		 * ```
		 */
		sse(path: string, handler: (c: Context) => (stream: any) => void): this;

		/**
		 * Create an SSE route with middleware.
		 *
		 * @param path - The route path
		 * @param middleware - Middleware to run before SSE streaming
		 * @param handler - Handler receiving SSE stream writer
		 *
		 * @example
		 * ```typescript
		 * router.sse('/protected-events', authMiddleware, (c) => async (stream) => {
		 *   stream.writeSSE({ data: 'Secure event', event: 'update' });
		 *   stream.close();
		 * });
		 * ```
		 */
		sse(
			path: string,
			middleware: MiddlewareHandler,
			handler: (c: Context) => (stream: any) => void
		): this;
	}
}

/**
 * Creates a Hono router with extended methods for Agentuity-specific routing patterns.
 *
 * In addition to standard HTTP methods (get, post, put, delete, patch), the router includes:
 * - **stream()** - Stream responses with ReadableStream
 * - **websocket()** - WebSocket connections
 * - **sse()** - Server-Sent Events
 * - **email()** - Email handler routing
 * - **sms()** - SMS handler routing
 * - **cron()** - Scheduled task routing
 *
 * @template E - Environment type (Hono Env)
 * @template S - Schema type for route definitions
 *
 * @returns Extended Hono router with custom methods
 *
 * @example
 * ```typescript
 * const router = createRouter();
 *
 * // Standard HTTP routes
 * router.get('/hello', (c) => c.text('Hello!'));
 * router.post('/data', async (c) => {
 *   const body = await c.req.json();
 *   return c.json({ received: body });
 * });
 *
 * // Streaming response
 * router.stream('/events', (c) => {
 *   return new ReadableStream({
 *     start(controller) {
 *       controller.enqueue('event 1\n');
 *       controller.enqueue('event 2\n');
 *       controller.close();
 *     }
 *   });
 * });
 *
 * // WebSocket connection
 * router.websocket('/ws', (c) => (ws) => {
 *   ws.onMessage((event) => {
 *     console.log('Received:', event.data);
 *     ws.send('Echo: ' + event.data);
 *   });
 * });
 *
 * // Server-Sent Events
 * router.sse('/notifications', (c) => async (stream) => {
 *   let count = 0;
 *   const interval = setInterval(() => {
 *     stream.writeSSE({ data: `Message ${++count}` });
 *     if (count >= 10) {
 *       clearInterval(interval);
 *       stream.close();
 *     }
 *   }, 1000);
 * });
 *
 * // Email routing
 * router.email('support@example.com', (email, c) => {
 *   console.log('From:', email.fromEmail());
 *   console.log('Subject:', email.subject());
 *   return c.text('Email received');
 * });
 *
 * // SMS routing
 * router.sms({ number: '+1234567890' }, (c) => {
 *   return c.text('SMS received');
 * });
 *
 * // Scheduled cron
 * router.cron('0 0 * * *', (c) => {
 *   console.log('Daily task running');
 *   return c.text('OK');
 * });
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

	// shim in special routes
	_router.email = (address: string, ...args: any[]) => {
		let middleware: MiddlewareHandler | undefined;
		let handler: EmailHandler;

		if (args.length === 1) {
			handler = args[0];
		} else {
			middleware = args[0];
			handler = args[1];
		}

		const id = hash(address);
		const path = `/${id}`;
		// registerEmailHandler(address)
		const wrapper = async (c: Context): Promise<Response> => {
			const contentType = (c.req.header('content-type') || '').trim().toLowerCase();
			if (!contentType.includes('message/rfc822')) {
				return c.text('Bad Request: Content-Type must be message/rfc822', 400);
			}

			const arrayBuffer = await c.req.arrayBuffer();
			const buffer = Buffer.from(arrayBuffer);

			const email = await parseEmail(buffer);

			let result = handler(email, c);
			if (result instanceof Promise) result = await result;

			if (result === undefined) {
				return c.text('OK', 200);
			}
			return returnResponse(c, result);
		};

		if (middleware) {
			return router.post(path, middleware, wrapper);
		} else {
			return router.post(path, wrapper);
		}
	};

	_router.sms = ({ number }: { number: string }, handler: AgentHandler) => {
		const id = hash(number);
		const path = `/${id}`;
		// registerSMSHandler(number)
		const wrapper = async (c: Context): Promise<Response> => {
			let result = handler(c);
			if (result instanceof Promise) result = await result;
			return returnResponse(c, result);
		};
		return router.post(path, wrapper);
	};

	_router.cron = (schedule: string, handler: AgentHandler) => {
		const id = hash(schedule);
		const path = `/${id}`;
		// registerCronHandler(schedule)
		const wrapper = async (c: Context): Promise<Response> => {
			let result = handler(c);
			if (result instanceof Promise) result = await result;
			return returnResponse(c, result);
		};
		return router.post(path, wrapper);
	};

	_router.stream = (path: string, ...args: any[]) => {
		let middleware: MiddlewareHandler | undefined;
		let handler: StreamHandler;

		if (args.length === 1) {
			handler = args[0];
		} else {
			middleware = args[0];
			handler = args[1];
		}

		const wrapper = (c: Context) => {
			// Capture the AgentContext from the request
			const asyncLocalStorage = getAgentAsyncLocalStorage();
			const capturedContext = asyncLocalStorage.getStore();

			return honoStream(c, async (s: any) => {
				const runInContext = async () => {
					try {
						let streamResult = handler(c);
						if (streamResult instanceof Promise) streamResult = await streamResult;
						await s.pipe(streamResult);
					} catch (err) {
						c.var.logger.error('Stream error:', err);
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

		// Use POST for stream routes - allows accepting request body
		// (validators will handle input validation if present)
		if (middleware) {
			return router.post(path, middleware, wrapper);
		} else {
			return router.post(path, wrapper);
		}
	};

	_router.websocket = (path: string, ...args: any[]) => {
		let middleware: MiddlewareHandler | undefined;
		let handler: WebSocketHandler;

		if (args.length === 1) {
			handler = args[0];
		} else {
			middleware = args[0];
			handler = args[1];
		}

		const wrapper = honoUpgradeWebSocket((c: Context) => {
			let openHandler: ((event: any) => void | Promise<void>) | undefined;
			let messageHandler: ((event: any) => void | Promise<void>) | undefined;
			let closeHandler: ((event: any) => void | Promise<void>) | undefined;
			let initialized = false;

			// Capture the AgentContext from the upgrade request
			const asyncLocalStorage = getAgentAsyncLocalStorage();
			const capturedContext = asyncLocalStorage.getStore();

			const wsConnection: WebSocketConnection = {
				onOpen: (h) => {
					openHandler = h;
				},
				onMessage: (h) => {
					messageHandler = h;
				},
				onClose: (h) => {
					closeHandler = h;
				},
				send: (_data: string | ArrayBuffer | Uint8Array) => {
					// This will be bound to the actual ws in the handlers
				},
			};

			const setupResult = handler(c);
			const setupFn = typeof setupResult === 'function' ? setupResult : null;

			// Call setup IMMEDIATELY during upgrade, not in onOpen
			// This allows the user's code to register handlers before events fire
			if (setupFn) {
				if (capturedContext) {
					asyncLocalStorage.run(capturedContext, () => setupFn(wsConnection));
				} else {
					setupFn(wsConnection);
				}
				initialized = true;
			}

			return {
				onOpen: async (event: any, ws: any) => {
					try {
						// Bind the real ws.send now that we have the actual websocket
						wsConnection.send = (data) => ws.send(data);

						if (openHandler) {
							// Run handler in captured context
							const handler = openHandler;
							if (capturedContext) {
								await asyncLocalStorage.run(capturedContext, () => handler(event));
							} else {
								await handler(event);
							}
						}
					} catch (err) {
						c.var.logger?.error('WebSocket onOpen error:', err);
						throw err;
					}
				},
				onMessage: async (event: any, ws: any) => {
					try {
						// Lazy initialization fallback (shouldn't normally happen)
						if (!initialized && setupFn) {
							wsConnection.send = (data) => ws.send(data);
							if (capturedContext) {
								await asyncLocalStorage.run(capturedContext, async () => {
									const result = setupFn(wsConnection);
									if (result instanceof Promise) await result;
								});
							} else {
								const result = setupFn(wsConnection);
								if (result instanceof Promise) await result;
							}
							initialized = true;
						}
						if (messageHandler) {
							// Run handler in captured context
							const handler = messageHandler;
							if (capturedContext) {
								await asyncLocalStorage.run(capturedContext, () => handler(event));
							} else {
								await handler(event);
							}
						}
					} catch (err) {
						c.var.logger?.error('WebSocket onMessage error:', err);
						throw err;
					}
				},
				onClose: async (event: any, _ws: any) => {
					try {
						if (closeHandler) {
							// Run handler in captured context
							const handler = closeHandler;
							if (capturedContext) {
								await asyncLocalStorage.run(capturedContext, () => handler(event));
							} else {
								await handler(event);
							}
						}
					} catch (err) {
						c.var.logger?.error('WebSocket onClose error:', err);
					}
				},
			};
		});

		// wrapper is what upgradeWebSocket(...) returned. Force arity=2 so our get shim
		// recognizes it as middleware and does not wrap/convert undefined -> 200.
		const wsMiddleware: MiddlewareHandler = (c, next) =>
			(wrapper as unknown as MiddlewareHandler)(c, next);

		if (middleware) {
			// Compose into a single middleware to avoid the 3-arg route which treats the
			// second function as a handler and wraps it.
			const composed: MiddlewareHandler = async (c, next) => {
				return middleware(c, async () => {
					await wsMiddleware(c, next);
				});
			};
			return router.get(path, composed);
		} else {
			return router.get(path, wsMiddleware);
		}
	};

	_router.sse = (path: string, ...args: any[]) => {
		let middleware: MiddlewareHandler | undefined;
		let handler: SSEHandler;

		if (args.length === 1) {
			handler = args[0];
		} else {
			middleware = args[0];
			handler = args[1];
		}

		const wrapper = (c: Context) => {
			// Capture the AgentContext from the request
			const asyncLocalStorage = getAgentAsyncLocalStorage();
			const capturedContext = asyncLocalStorage.getStore();

			return honoStreamSSE(c, async (stream: any) => {
				// Wrap the stream to intercept write() calls
				const wrappedStream = {
					...stream,
					write: async (data: any) => {
						// Convert simple write to writeSSE format
						if (
							typeof data === 'string' ||
							typeof data === 'number' ||
							typeof data === 'boolean'
						) {
							return stream.writeSSE({ data: String(data) });
						} else if (typeof data === 'object' && data !== null) {
							// If it's already an SSE message object, pass it through
							return stream.writeSSE(data);
						}
						return stream.writeSSE({ data: String(data) });
					},
					writeSSE: stream.writeSSE.bind(stream),
					onAbort: stream.onAbort.bind(stream),
					close: stream.close?.bind(stream),
				};

				const runInContext = async () => {
					await handler(c)(wrappedStream);
				};

				if (capturedContext) {
					await asyncLocalStorage.run(capturedContext, runInContext);
				} else {
					await runInContext();
				}
			});
		};

		if (middleware) {
			return router.get(path, middleware, wrapper);
		} else {
			return router.get(path, wrapper);
		}
	};

	return router;
};
