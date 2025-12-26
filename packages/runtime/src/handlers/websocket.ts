import type { Context, MiddlewareHandler } from 'hono';
import { upgradeWebSocket } from 'hono/bun';
import { getAgentAsyncLocalStorage } from '../_context';
import type { Env } from '../app';

/**
 * WebSocket connection interface for handling WebSocket events.
 */
export interface WebSocketConnection {
	onOpen: (handler: (event: Event) => void | Promise<void>) => void;
	onMessage: (handler: (event: MessageEvent) => void | Promise<void>) => void;
	onClose: (handler: (event: CloseEvent) => void | Promise<void>) => void;
	send: (data: string | ArrayBuffer | Uint8Array) => void;
}

/**
 * Handler function for WebSocket connections.
 * Receives the Hono context and WebSocket connection with a flattened signature.
 */
export type WebSocketHandler<E extends Env = Env> = (
	c: Context<E>,
	ws: WebSocketConnection
) => void | Promise<void>;

/**
 * Creates a WebSocket middleware for handling WebSocket connections.
 *
 * Use with router.get() to create a WebSocket endpoint:
 *
 * @example
 * ```typescript
 * import { createRouter, websocket } from '@agentuity/runtime';
 *
 * const router = createRouter();
 *
 * router.get('/ws', websocket((c, ws) => {
 *   ws.onOpen(() => {
 *     console.log('WebSocket opened');
 *     ws.send('Welcome!');
 *   });
 *
 *   ws.onMessage((event) => {
 *     console.log('Received:', event.data);
 *     ws.send('Echo: ' + event.data);
 *   });
 *
 *   ws.onClose(() => {
 *     console.log('WebSocket closed');
 *   });
 * }));
 * ```
 *
 * @param handler - Handler function receiving context and WebSocket connection
 * @returns Hono middleware handler for WebSocket upgrade
 */
export function websocket<E extends Env = Env>(handler: WebSocketHandler<E>): MiddlewareHandler<E> {
	const wsHandler = upgradeWebSocket((c: Context<E>) => {
		let openHandler: ((event: Event) => void | Promise<void>) | undefined;
		let messageHandler: ((event: MessageEvent) => void | Promise<void>) | undefined;
		let closeHandler: ((event: CloseEvent) => void | Promise<void>) | undefined;
		let initialized = false;

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

		const runHandler = () => {
			if (capturedContext) {
				asyncLocalStorage.run(capturedContext, () => handler(c, wsConnection));
			} else {
				handler(c, wsConnection);
			}
			initialized = true;
		};

		runHandler();

		return {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			onOpen: async (event: Event, ws: any) => {
				try {
					wsConnection.send = (data) => ws.send(data);

					if (openHandler) {
						const h = openHandler;
						if (capturedContext) {
							await asyncLocalStorage.run(capturedContext, () => h(event));
						} else {
							await h(event);
						}
					}
				} catch (err) {
					c.var.logger?.error('WebSocket onOpen error:', err);
					throw err;
				}
			},
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			onMessage: async (event: MessageEvent, ws: any) => {
				try {
					if (!initialized) {
						wsConnection.send = (data) => ws.send(data);
						runHandler();
					}
					if (messageHandler) {
						const h = messageHandler;
						if (capturedContext) {
							await asyncLocalStorage.run(capturedContext, () => h(event));
						} else {
							await h(event);
						}
					}
				} catch (err) {
					c.var.logger?.error('WebSocket onMessage error:', err);
					throw err;
				}
			},
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			onClose: async (event: CloseEvent, _ws: any) => {
				try {
					if (closeHandler) {
						const h = closeHandler;
						if (capturedContext) {
							await asyncLocalStorage.run(capturedContext, () => h(event));
						} else {
							await h(event);
						}
					}
				} catch (err) {
					c.var.logger?.error('WebSocket onClose error:', err);
				}
			},
		};
	});

	const middleware: MiddlewareHandler<E> = (c, next) =>
		(wsHandler as unknown as MiddlewareHandler<E>)(c, next);

	return middleware;
}
