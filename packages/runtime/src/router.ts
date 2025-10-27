/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-empty-object-type */
import { type Context, Hono, type Input, type MiddlewareHandler, type Schema } from 'hono';
import { stream as honoStream, streamSSE as honoStreamSSE } from 'hono/streaming';
import { upgradeWebSocket as honoUpgradeWebSocket } from 'hono/bun';
import { hash, returnResponse } from './_util';
import type { Env } from './app';

type AgentHandler<E extends Env = Env, P extends string = string, I extends Input = {}> = (
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

type ExtendedHono<E extends Env = Env, S extends Schema = {}> = {
	[K in Exclude<keyof Hono<E, S>, HttpMethod>]: Hono<E, S>[K];
} & {
	[K in HttpMethod]: {
		<P extends string = string>(path: P, handler: AgentHandler<E, P>): Hono<E, S>;
		<P extends string = string, I extends Input = {}>(
			path: P,
			middleware: MiddlewareHandler<E, P, I>,
			handler: AgentHandler<E, P, I>
		): Hono<E, S>;
		<P extends string = string, I extends Input = {}>(
			path: P,
			middleware: MiddlewareHandler<E, P, I>
		): Hono<E, S>;
	};
} & {
	email(address: string, handler: AgentHandler): Hono<E, S>;
	sms(params: { number: string }, handler: AgentHandler): Hono<E, S>;
	cron(schedule: string, handler: AgentHandler): Hono<E, S>;
	stream<P extends string = string>(path: P, handler: StreamHandler<E, P>): Hono<E, S>;
	stream<P extends string = string, I extends Input = {}>(
		path: P,
		middleware: MiddlewareHandler<E, P, I>,
		handler: StreamHandler<E, P, I>
	): Hono<E, S>;
	websocket<P extends string = string>(path: P, handler: WebSocketHandler<E, P>): Hono<E, S>;
	websocket<P extends string = string, I extends Input = {}>(
		path: P,
		middleware: MiddlewareHandler<E, P, I>,
		handler: WebSocketHandler<E, P, I>
	): Hono<E, S>;
	sse<P extends string = string>(path: P, handler: SSEHandler<E, P>): Hono<E, S>;
	sse<P extends string = string, I extends Input = {}>(
		path: P,
		middleware: MiddlewareHandler<E, P, I>,
		handler: SSEHandler<E, P, I>
	): Hono<E, S>;
};

export const createRouter = <E extends Env = Env, S extends Schema = Schema>(): ExtendedHono<
	E,
	S
> => {
	const router = new Hono<E, S>();
	// tslint:disable-next-line:no-any no-unused-variable
	// biome-ignore lint:no-any
	const _router = router as any;

	for (const method of ['get', 'put', 'post', 'delete', 'options', 'patch']) {
		const _originalInvoker = _router[method].bind(router);
		_router[method] = (path: string, ...args: any[]) => {
			if (args.length === 1) {
				const arg = args[0];
				// Check if it's a middleware (not our agent handler)
				if (typeof arg === 'function' && arg.length === 2) {
					// Middleware only: (path, middleware)
					return _originalInvoker(path, arg);
				}
				// 2-arg: (path, handler)
				const handler = arg;
				const wrapper = async (c: Context): Promise<Response> => {
					let result = handler(c);
					if (result instanceof Promise) result = await result;
					return returnResponse(c, result);
				};
				return _originalInvoker(path, wrapper);
			} else {
				// 3-arg: (path, middleware, handler)
				const middleware = args[0];
				const handler = args[1];
				const wrapper = async (c: Context): Promise<Response> => {
					let result = handler(c);
					if (result instanceof Promise) result = await result;
					return returnResponse(c, result);
				};
				return _originalInvoker(path, middleware, wrapper);
			}
		};
	}

	// shim in special routes
	_router.email = (address: string, handler: AgentHandler) => {
		const id = hash(address);
		const path = `/email/${id}`;
		// registerEmailHandler(address)
		const wrapper = async (c: Context): Promise<Response> => {
			let result = handler(c);
			if (result instanceof Promise) result = await result;
			return returnResponse(c, result);
		};
		return router.post(path, wrapper);
	};

	_router.sms = ({ number }: { number: string }, handler: AgentHandler) => {
		const id = hash(number);
		const path = `/sms/${id}`;
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
		const path = `/cron/${id}`;
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
			return honoStream(c, async (s: any) => {
				try {
					let streamResult = handler(c);
					if (streamResult instanceof Promise) streamResult = await streamResult;
					await s.pipe(streamResult);
				} catch (err) {
					console.error('Stream error:', err);
					throw err;
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

			return {
				onOpen: async (event: any, ws: any) => {
					if (!initialized && setupFn) {
						wsConnection.send = (data) => ws.send(data);
						const result = setupFn(wsConnection);
						if (result instanceof Promise) await result;
						initialized = true;
					}
					if (openHandler) {
						await openHandler(event);
					}
				},
				onMessage: async (event: any, ws: any) => {
					if (!initialized && setupFn) {
						wsConnection.send = (data) => ws.send(data);
						const result = setupFn(wsConnection);
						if (result instanceof Promise) await result;
						initialized = true;
					}
					if (messageHandler) {
						await messageHandler(event);
					}
				},
				onClose: async (event: any, _ws: any) => {
					if (closeHandler) {
						await closeHandler(event);
					}
				},
			};
		});

		if (middleware) {
			return router.get(path, middleware, wrapper);
		} else {
			return router.get(path, wrapper);
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

				await handler(c)(wrappedStream);
			});
		};

		if (middleware) {
			return router.get(path, middleware, wrapper);
		} else {
			return router.get(path, wrapper);
		}
	};

	return router as unknown as ExtendedHono<E, S>;
};
