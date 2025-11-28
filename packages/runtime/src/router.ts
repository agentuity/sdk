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

interface WebSocketConnection {
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

type HttpMethod = 'get' | 'post' | 'put' | 'delete' | 'patch' | 'options';

// Module augmentation to add custom methods to Hono
// This avoids wrapper types and type instantiation depth issues
// Use simplified signatures to avoid type instantiation depth issues
declare module 'hono' {
	interface Hono {
		// Email routing with optional middleware
		email(address: string, handler: (email: Email, c: Context) => any): this;
		email(
			address: string,
			middleware: MiddlewareHandler,
			handler: (email: Email, c: Context) => any
		): this;

		// SMS routing
		sms(params: { number: string }, handler: (c: Context) => any): this;

		// Cron scheduling
		cron(schedule: string, handler: (c: Context) => any): this;

		// Streaming routes
		stream(path: string, handler: (c: Context) => ReadableStream<any>): this;
		stream(
			path: string,
			middleware: MiddlewareHandler,
			handler: (c: Context) => ReadableStream<any>
		): this;

		// WebSocket routes
		websocket(path: string, handler: (c: Context) => (ws: any) => void): this;
		websocket(
			path: string,
			middleware: MiddlewareHandler,
			handler: (c: Context) => (ws: any) => void
		): this;

		// Server-Sent Events routes
		sse(path: string, handler: (c: Context) => (stream: any) => void): this;
		sse(
			path: string,
			middleware: MiddlewareHandler,
			handler: (c: Context) => (stream: any) => void
		): this;
	}
}

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

		if (middleware) {
			return router.get(path, middleware, wrapper);
		} else {
			return router.get(path, wrapper);
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
