import type { Context, MiddlewareHandler } from 'hono';
import { upgradeWebSocket } from 'hono/bun';
import { context as otelContext, ROOT_CONTEXT } from '@opentelemetry/api';
import { getAgentAsyncLocalStorage } from '../_context.ts';
import type { Env } from '../app.ts';
import { WebRTCRoomManager, type WebRTCOptions } from '../webrtc-signaling.ts';
import type { WebSocketConnection } from './websocket.ts';

export type { WebRTCOptions };

/**
 * Handler function for WebRTC signaling connections.
 * Receives the Hono context and WebRTCRoomManager.
 */
export type WebRTCHandler<E extends Env = Env> = (
	c: Context<E>,
	roomManager: WebRTCRoomManager
) => void | Promise<void>;

/**
 * Creates a WebRTC signaling middleware for peer-to-peer communication.
 *
 * This middleware sets up a WebSocket-based signaling server that handles:
 * - Room membership and peer discovery
 * - SDP offer/answer relay
 * - ICE candidate relay
 *
 * Use with router.get() to create a WebRTC signaling endpoint:
 *
 * @example
 * ```typescript
 * import { createRouter, webrtc } from '@agentuity/runtime';
 *
 * const router = createRouter();
 *
 * // Basic signaling endpoint
 * router.get('/call/signal', webrtc());
 *
 * // With options
 * router.get('/call/signal', webrtc({ maxPeers: 4 }));
 *
 * // With callbacks for monitoring
 * router.get('/call/signal', webrtc({
 *   maxPeers: 2,
 *   callbacks: {
 *     onRoomCreated: (roomId) => console.log(`Room ${roomId} created`),
 *     onPeerJoin: (peerId, roomId) => console.log(`${peerId} joined ${roomId}`),
 *     onPeerLeave: (peerId, roomId, reason) => {
 *       console.log(`${peerId} left ${roomId}: ${reason}`);
 *     },
 *   },
 * }));
 * ```
 *
 * @param options - Configuration options for WebRTC signaling
 * @returns Hono middleware handler for WebSocket upgrade
 */
export function webrtc<E extends Env = Env>(options?: WebRTCOptions): MiddlewareHandler<E> {
	const roomManager = new WebRTCRoomManager(options);

	const wsHandler = upgradeWebSocket((_c: Context<E>) => {
		let currentWs: WebSocketConnection | undefined;
		// we need a Privder interface here with AsyncLocalStorage and KV
		const asyncLocalStorage = getAgentAsyncLocalStorage();
		const capturedContext = asyncLocalStorage.getStore();

		return {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			onOpen: (_event: Event, ws: any) => {
				otelContext.with(ROOT_CONTEXT, () => {
					if (capturedContext) {
						asyncLocalStorage.run(capturedContext, () => {
							currentWs = {
								onOpen: () => {},
								onMessage: () => {},
								onClose: () => {},
								send: (data) => ws.send(data),
							};
						});
					} else {
						currentWs = {
							onOpen: () => {},
							onMessage: () => {},
							onClose: () => {},
							send: (data) => ws.send(data),
						};
					}
				});
			},
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			onMessage: (event: MessageEvent, _ws: any) => {
				if (currentWs) {
					otelContext.with(ROOT_CONTEXT, () => {
						if (capturedContext) {
							asyncLocalStorage.run(capturedContext, () => {
								roomManager.handleMessage(currentWs!, String(event.data));
							});
						} else {
							roomManager.handleMessage(currentWs!, String(event.data));
						}
					});
				}
			},
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			onClose: (_event: CloseEvent, _ws: any) => {
				if (currentWs) {
					otelContext.with(ROOT_CONTEXT, () => {
						if (capturedContext) {
							asyncLocalStorage.run(capturedContext, () => {
								roomManager.handleDisconnect(currentWs!);
							});
						} else {
							roomManager.handleDisconnect(currentWs!);
						}
					});
				}
			},
		};
	});

	const middleware: MiddlewareHandler<E> = (c, next) =>
		(wsHandler as unknown as MiddlewareHandler<E>)(c, next);

	return middleware;
}
