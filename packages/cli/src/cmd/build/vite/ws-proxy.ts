/**
 * WebSocket-aware front-door TCP proxy for dev mode.
 *
 * Bun's node:http has several bugs that prevent Vite's built-in http-proxy
 * from proxying WebSocket upgrades (see linked PRs). Rather than polyfilling
 * those bugs, this module places a lightweight `net.createServer` on the
 * user-facing port. It inspects the first bytes of each TCP connection and
 * routes accordingly:
 *
 * - **WebSocket upgrades to backend paths** → piped directly to Bun backend
 *   (Bun's native `server.upgrade()` works perfectly over raw TCP)
 * - **Everything else** (HTTP requests, Vite HMR WebSocket) → piped to Vite
 *
 * From the browser's perspective there is only one port. Vite and Bun both
 * listen on internal ports that are never exposed.
 *
 * Bun bugs this works around:
 * - https://github.com/oven-sh/bun/pull/27237 (socket.write drops data)
 * - https://github.com/oven-sh/bun/pull/26264 (missing destroySoon)
 * - https://github.com/oven-sh/bun/pull/27859 (http.request upgrade event)
 * - Server-side upgrade socket read broken (HTTP parser doesn't hand off)
 *
 * This entire module can be removed once those Bun PRs are merged and the
 * Vite `ws: true` proxy works natively under Bun.
 *
 * ```
 * Browser ──TCP──▶ net.Server (:3500, user-facing)
 *                     │
 *         ┌───────────┴───────────┐
 *         ▼ (WS upgrade to       ▼ (everything else)
 *          backend paths)
 *   Bun backend (:3501)    Vite server (:3502)
 * ```
 */

import { createServer, connect, type Server, type Socket } from 'node:net';
import type { Logger } from '../../../types';

export interface WsProxyOptions {
	/** Port the front-door proxy listens on (user-facing) */
	port: number;
	/** Port of the Vite dev server (internal) */
	vitePort: number;
	/** Port of the Bun backend server (internal) */
	backendPort: number;
	/** Route path prefixes that should be proxied to the backend */
	routePaths: string[];
	logger: Logger;
}

/**
 * Front-door TCP proxy server.
 *
 * Extends `net.Server` with a `closeAll()` method that destroys all live
 * client + upstream sockets and waits for the listening socket to close.
 * The native `Server.close()` only stops accepting new connections — long-
 * lived piped sockets (Vite HMR WebSocket, backend WS) keep the listener
 * bound until they close on their own. During dev-mode shutdown we want
 * the user-facing port released immediately, so cleanup paths should
 * prefer `closeAll()` over `close()`.
 */
export interface WsProxyServer extends Server {
	closeAll(): Promise<void>;
}

/**
 * Start a front-door TCP proxy that routes WebSocket upgrades to the Bun
 * backend and everything else to Vite. Returns the `net.Server` instance.
 */
export function startWsProxy(options: WsProxyOptions): Promise<WsProxyServer> {
	const { port, vitePort, backendPort, routePaths, logger } = options;

	// Prefixes whose WebSocket upgrades go to Bun instead of Vite
	const wsPathPrefixes = ['/_agentuity', ...routePaths];

	// Track every live socket pair so shutdown can drop them. Without this,
	// `server.close()` waits for active connections to terminate by themselves
	// (e.g. browser HMR WebSockets), which can keep the user-facing port bound
	// for many seconds after dev mode exits.
	const liveSockets = new Set<Socket>();
	const trackSocket = (sock: Socket) => {
		liveSockets.add(sock);
		sock.once('close', () => liveSockets.delete(sock));
	};

	return new Promise((resolve, reject) => {
		const server = createServer((socket) => {
			trackSocket(socket);
			let handled = false;

			// Peek at the first chunk to decide where to route
			socket.once('data', (firstChunk) => {
				handled = true;

				const header = firstChunk.toString('utf8', 0, Math.min(firstChunk.length, 4096));

				// Detect: is this a WebSocket upgrade for a backend path?
				const isUpgrade = /upgrade:\s*websocket/i.test(header);
				let targetPort = vitePort;

				if (isUpgrade) {
					const pathMatch = header.match(/^(?:GET|POST)\s+(\S+)/);
					const pathname = (pathMatch?.[1] ?? '/').split('?')[0] ?? '/';

					const isBackendPath = wsPathPrefixes.some(
						(prefix) => pathname === prefix || pathname.startsWith(prefix + '/')
					);

					if (isBackendPath) {
						targetPort = backendPort;
						logger.debug('WS upgrade %s → Bun :%d', pathname, backendPort);
					}
				}

				const target = connect(targetPort, '127.0.0.1');
				trackSocket(target);

				target.on('connect', () => {
					target.write(firstChunk);
					socket.pipe(target);
					target.pipe(socket);
				});

				target.on('error', () => {
					if (!socket.destroyed) socket.destroy();
				});
				socket.on('error', () => {
					if (!target.destroyed) target.destroy();
				});
			});

			// Client disconnected before sending anything
			socket.on('close', () => {
				if (!handled) socket.destroy();
			});
			socket.on('error', () => {
				if (!handled) socket.destroy();
			});
		}) as WsProxyServer;

		// Async close that destroys live sockets first, then waits for the
		// listener to close. Idempotent: safe to call after the server has
		// already been closed by other means.
		server.closeAll = () => {
			return new Promise<void>((resolveClose) => {
				for (const sock of liveSockets) {
					try {
						if (!sock.destroyed) sock.destroy();
					} catch {
						// Best effort
					}
				}
				liveSockets.clear();

				if (!server.listening) {
					resolveClose();
					return;
				}
				server.close(() => resolveClose());
			});
		};

		server.on('error', reject);

		server.listen(port, '127.0.0.1', () => {
			logger.debug(
				'WS front-door proxy on :%d (Vite :%d, Bun :%d)',
				port,
				vitePort,
				backendPort
			);
			resolve(server);
		});
	});
}
