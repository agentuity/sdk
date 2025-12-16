/**
 * Vite WebSocket Upgrade Plugin
 *
 * Enables WebSocket connections in Vite dev server by intercepting HTTP upgrade requests
 * and manually handling WebSocket protocol using the 'ws' library.
 *
 * @see https://github.com/honojs/vite-plugins/issues/253
 */

import type { Plugin, ViteDevServer } from 'vite';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, WebSocket } from 'ws';
import type { Logger } from '../../../types';

export interface WebSocketPluginOptions {
	logger: Logger;
}

/**
 * Create a Vite plugin that enables WebSocket upgrades in dev mode
 */
export function websocketPlugin(options: WebSocketPluginOptions): Plugin {
	const { logger } = options;

	return {
		name: 'agentuity:websocket',
		enforce: 'post',

		configureServer(server: ViteDevServer) {
			if (!server.httpServer) {
				logger.warn('WebSocket plugin: httpServer not available');
				return;
			}

			logger.debug('WebSocket plugin: Setting up upgrade handler');

			// Create WebSocket server (noServer mode - we'll handle upgrades manually)
			const wss = new WebSocketServer({ noServer: true });

			// Store active connections for broadcast/cleanup
			const connections = new Set<WebSocket>();

			// Handle WebSocket connections
			wss.on('connection', (ws: WebSocket) => {
				connections.add(ws);
				logger.debug('WebSocket client connected');

				// Send initial "alive" message (workbench expects this)
				ws.send('alive');

				ws.on('message', (data: Buffer) => {
					const message = data.toString();
					logger.trace(`WebSocket message received: ${message}`);

					// Handle 'restarting' and 'alive' messages (broadcast to other clients)
					if (message === 'restarting' || message === 'alive') {
						for (const client of connections) {
							if (client !== ws && client.readyState === WebSocket.OPEN) {
								try {
									client.send(message);
								} catch (error) {
									logger.trace(`Failed to broadcast to client: ${error}`);
									connections.delete(client);
								}
							}
						}
					}
				});

				ws.on('close', () => {
					connections.delete(ws);
					logger.debug('WebSocket client disconnected');
				});

				ws.on('error', (error) => {
					logger.trace(`WebSocket error: ${error.message}`);
					connections.delete(ws);
				});
			});

			// Intercept ALL upgrade requests for WebSocket connections
			server.httpServer.on('upgrade', async (req: IncomingMessage, socket: Duplex, head: Buffer) => {
				const url = req.url || '/';
				logger.debug(`WebSocket upgrade request: ${url}`);

				// Import the Hono app to check if this path has a WebSocket handler
				try {
					const { default: app } = await import(`${server.config.root}/.agentuity/app.generated.ts`);

					// Create a test request to see if Hono has a route for this path
					const testReq = new Request(`http://localhost${url}`, { method: 'GET' });
					const testRes = await app.fetch(testReq);

					// If Hono returns 426 Upgrade Required, it's a WebSocket route
					if (testRes.status === 426) {
						logger.debug(`WebSocket route found for ${url}, handling upgrade`);

						// Handle the upgrade using ws library
						wss.handleUpgrade(req, socket, head, (ws) => {
							wss.emit('connection', ws, req);
						});
					} else {
						// Not a WebSocket route in Hono, let Vite handle it
						logger.trace(`Not a WebSocket route: ${url} (status ${testRes.status})`);
					}
				} catch (error) {
					logger.error(`Failed to check WebSocket route: ${error instanceof Error ? error.message : String(error)}`);
					socket.destroy();
				}
			});

			logger.debug('WebSocket plugin: Upgrade handler configured');
		},
	};
}
