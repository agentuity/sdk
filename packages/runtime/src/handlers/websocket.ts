import type { Context, MiddlewareHandler } from 'hono';
import { upgradeWebSocket } from 'hono/bun';
import { context as otelContext, ROOT_CONTEXT } from '@opentelemetry/api';
import { getAgentAsyncLocalStorage } from '../_context';
import type { Env } from '../app';
import { tagRoute } from './_route-meta';

/**
 * Context key for WebSocket close promise.
 * Used by middleware to defer session finalization until WebSocket closes.
 */
export const WS_DONE_PROMISE_KEY = '_wsDonePromise';

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
 *
 * **This handler must be synchronous** (returns `void`, not `Promise<void>`).
 * The handler is called inside Hono's `upgradeWebSocket` factory, which must
 * return event handlers synchronously for the HTTP upgrade to complete. If the
 * handler were async, any `ws.onOpen`/`ws.onMessage`/`ws.onClose` registrations
 * after an `await` would be silently lost because the factory returns before
 * they are registered.
 *
 * To perform async work, place it inside the `onOpen`, `onMessage`, or `onClose`
 * callbacks, which are properly awaited by the runtime.
 */
export type WebSocketHandler<E extends Env = Env> = (
	c: Context<E>,
	ws: WebSocketConnection
) => void;

/**
 * Creates a WebSocket middleware for handling WebSocket connections.
 *
 * The handler must be **synchronous** — it runs inside Hono's `upgradeWebSocket`
 * factory which must return event handlers synchronously for the HTTP upgrade to
 * complete. Async work should go inside `onOpen`, `onMessage`, or `onClose`
 * callbacks, which are properly awaited by the runtime.
 *
 * Use with router.get() to create a WebSocket endpoint:
 *
 * @example
 * ```typescript
 * // Basic synchronous usage
 * import { createRouter, websocket } from '@agentuity/runtime';
 *
 * const router = createRouter();
 *
 * router.get('/ws', websocket((c, ws) => {
 *   ws.onOpen(() => {
 *     c.var.logger.info('WebSocket opened');
 *     ws.send('Welcome!');
 *   });
 *
 *   ws.onMessage((event) => {
 *     c.var.logger.info('Received:', event.data);
 *     ws.send('Echo: ' + event.data);
 *   });
 *
 *   ws.onClose(() => {
 *     c.var.logger.info('WebSocket closed');
 *   });
 * }));
 * ```
 *
 * @example
 * ```typescript
 * // Async work inside callbacks (correct pattern)
 * router.get('/ws', websocket((c, ws) => {
 *   ws.onOpen(async () => {
 *     const user = await fetchUser(c.var.auth);
 *     ws.send(JSON.stringify({ welcome: user.name }));
 *   });
 *
 *   ws.onMessage(async (event) => {
 *     const result = await processMessage(event.data);
 *     ws.send(JSON.stringify(result));
 *   });
 * }));
 * ```
 *
 * @param handler - Synchronous handler function receiving context and WebSocket connection
 * @returns Hono middleware handler for WebSocket upgrade
 */
export function websocket<E extends Env = Env>(
	handler: WebSocketHandler<E>
): MiddlewareHandler<E, string, { outputFormat: 'ws' }> {
	const wsHandler = upgradeWebSocket((c: Context<E>) => {
		let openHandler: ((event: Event) => void | Promise<void>) | undefined;
		let messageHandler: ((event: MessageEvent) => void | Promise<void>) | undefined;
		let closeHandler: ((event: CloseEvent) => void | Promise<void>) | undefined;
		let initialized = false;

		const asyncLocalStorage = getAgentAsyncLocalStorage();
		const capturedContext = asyncLocalStorage.getStore();

		// Create done promise for session lifecycle deferral, but ONLY for actual
		// WebSocket upgrade requests. The factory runs unconditionally for every
		// request hitting this route (Hono calls createEvents before attempting
		// server.upgrade). For non-upgrade HTTP requests, setting the promise would
		// cause the middleware to hang forever waiting for an onClose that never fires.
		let resolveDone: (() => void) | undefined;
		const isUpgrade = c.req.header('upgrade')?.toLowerCase() === 'websocket';

		if (isUpgrade) {
			const donePromise = new Promise<void>((resolve) => {
				resolveDone = resolve;
			});

			// Defensive: guard against future code adding rejection paths
			donePromise.catch(() => {});

			// Set on context so middleware defers session finalization until WS closes
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			(c as any).set(WS_DONE_PROMISE_KEY, donePromise);
		}

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

		// IMPORTANT: We run in ROOT_CONTEXT (no active OTEL span) to avoid a Bun bug
		// where OTEL-instrumented fetch conflicts with streaming responses.
		// See: https://github.com/agentuity/sdk/issues/471
		// See: https://github.com/oven-sh/bun/issues/24766
		const runHandler = () => {
			otelContext.with(ROOT_CONTEXT, () => {
				if (capturedContext) {
					asyncLocalStorage.run(capturedContext, () => handler(c, wsConnection));
				} else {
					handler(c, wsConnection);
				}
			});
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
						await otelContext.with(ROOT_CONTEXT, async () => {
							if (capturedContext) {
								await asyncLocalStorage.run(capturedContext, () => h(event));
							} else {
								await h(event);
							}
						});
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
						await otelContext.with(ROOT_CONTEXT, async () => {
							if (capturedContext) {
								await asyncLocalStorage.run(capturedContext, () => h(event));
							} else {
								await h(event);
							}
						});
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
						await otelContext.with(ROOT_CONTEXT, async () => {
							if (capturedContext) {
								await asyncLocalStorage.run(capturedContext, () => h(event));
							} else {
								await h(event);
							}
						});
					}
				} catch (err) {
					c.var.logger?.error('WebSocket onClose error:', err);
				} finally {
					// Resolve the done promise to trigger session finalization
					// This must fire even if the user's onClose handler throws
					resolveDone?.();
				}
			},
		};
	});

	const middleware: MiddlewareHandler<E, string, { outputFormat: 'ws' }> = (c, next) =>
		(wsHandler as unknown as MiddlewareHandler<E, string, { outputFormat: 'ws' }>)(c, next);

	return tagRoute(middleware, { type: 'websocket' });
}
