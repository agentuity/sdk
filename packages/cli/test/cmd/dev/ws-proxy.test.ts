import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { join } from 'node:path';
import { createServer, connect, type Server } from 'node:net';
import { tmpdir } from 'node:os';
import { mkdirSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const wsProxyPath = join(import.meta.dir, '../../../src/cmd/build/vite/ws-proxy.ts');

/**
 * Helper to find an available port
 */
async function findAvailablePort(startPort: number): Promise<number> {
	for (let port = startPort; port < startPort + 100; port++) {
		const available = await new Promise<boolean>((resolve) => {
			const server = createServer();
			server.once('error', () => resolve(false));
			server.listen(port, '127.0.0.1', () => {
				server.close(() => resolve(true));
			});
		});
		if (available) return port;
	}
	throw new Error('Could not find available port');
}

/**
 * Create a simple TCP server that echoes back what it receives
 * Used to simulate Vite or Bun backend
 */
function createEchoServer(port: number, label: string): Promise<Server> {
	return new Promise((resolve, reject) => {
		const server = createServer((socket) => {
			socket.on('data', (data) => {
				// Echo back with label prefix
				socket.write(`[${label}] ` + data.toString());
			});
		});

		server.on('error', reject);
		server.listen(port, '127.0.0.1', () => resolve(server));
	});
}

/**
 * Create a WebSocket upgrade request (raw HTTP format)
 */
function createWebSocketUpgradeRequest(path: string, host: string, port: number): string {
	const key = Buffer.from(randomUUID()).toString('base64');
	return [
		`GET ${path} HTTP/1.1`,
		`Host: ${host}:${port}`,
		'Upgrade: websocket',
		'Connection: Upgrade',
		`Sec-WebSocket-Key: ${key}`,
		'Sec-WebSocket-Version: 13',
		'\r\n',
	].join('\r\n');
}

/**
 * Create a regular HTTP GET request
 */
function createHttpRequest(path: string, host: string, port: number): string {
	return [`GET ${path} HTTP/1.1`, `Host: ${host}:${port}`, 'Connection: keep-alive', '\r\n'].join(
		'\r\n'
	);
}

describe('WS Proxy', () => {
	let testDir: string;
	let mockLogger: {
		debug: (...args: unknown[]) => void;
		warn: (...args: unknown[]) => void;
		error: (...args: unknown[]) => void;
	};

	beforeEach(() => {
		testDir = join(tmpdir(), `ws-proxy-test-${Date.now()}`);
		mkdirSync(testDir, { recursive: true });

		mockLogger = {
			debug: () => {},
			warn: () => {},
			error: () => {},
		};
	});

	afterEach(async () => {
		try {
			rmSync(testDir, { recursive: true, force: true });
		} catch {
			// Ignore
		}
	});

	describe('startWsProxy', () => {
		test('starts proxy server on specified port', async () => {
			const { startWsProxy } = await import(wsProxyPath);

			const proxyPort = await findAvailablePort(14000);
			const vitePort = await findAvailablePort(proxyPort + 1);
			const backendPort = await findAvailablePort(vitePort + 1);

			const viteServer = await createEchoServer(vitePort, 'VITE');
			const backendServer = await createEchoServer(backendPort, 'BUN');

			const proxy = await startWsProxy({
				port: proxyPort,
				vitePort,
				backendPort,
				routePaths: ['/api'],
				logger: mockLogger,
			});

			expect(proxy).toBeDefined();
			expect(proxy.listening).toBe(true);

			// Clean up
			await new Promise<void>((resolve) => proxy.close(() => resolve()));
			await new Promise<void>((resolve) => viteServer.close(() => resolve()));
			await new Promise<void>((resolve) => backendServer.close(() => resolve()));
		});

		test('routes regular HTTP requests to Vite', async () => {
			const { startWsProxy } = await import(wsProxyPath);

			const proxyPort = await findAvailablePort(14100);
			const vitePort = await findAvailablePort(proxyPort + 1);
			const backendPort = await findAvailablePort(vitePort + 1);

			const viteServer = await createEchoServer(vitePort, 'VITE');
			const backendServer = await createEchoServer(backendPort, 'BUN');

			const proxy = await startWsProxy({
				port: proxyPort,
				vitePort,
				backendPort,
				routePaths: ['/api'],
				logger: mockLogger,
			});

			// Send regular HTTP request
			const response = await new Promise<string>((resolve, reject) => {
				const client = connect(proxyPort, '127.0.0.1');
				const chunks: string[] = [];

				client.on('connect', () => {
					client.write(createHttpRequest('/some/path', '127.0.0.1', proxyPort));
				});

				client.on('data', (data) => {
					chunks.push(data.toString());
					client.end();
				});

				client.on('end', () => resolve(chunks.join('')));
				client.on('error', reject);

				// Timeout
				setTimeout(() => {
					client.destroy();
					reject(new Error('Timeout'));
				}, 2000);
			});

			// Should have been routed to Vite
			expect(response).toContain('[VITE]');

			// Clean up
			await new Promise<void>((resolve) => proxy.close(() => resolve()));
			await new Promise<void>((resolve) => viteServer.close(() => resolve()));
			await new Promise<void>((resolve) => backendServer.close(() => resolve()));
		});

		test('routes WebSocket upgrade for /api to backend', async () => {
			const { startWsProxy } = await import(wsProxyPath);

			const proxyPort = await findAvailablePort(14200);
			const vitePort = await findAvailablePort(proxyPort + 1);
			const backendPort = await findAvailablePort(vitePort + 1);

			const viteServer = await createEchoServer(vitePort, 'VITE');
			const backendServer = await createEchoServer(backendPort, 'BUN');

			const proxy = await startWsProxy({
				port: proxyPort,
				vitePort,
				backendPort,
				routePaths: ['/api'],
				logger: mockLogger,
			});

			// Send WebSocket upgrade request for /api path
			const response = await new Promise<string>((resolve, reject) => {
				const client = connect(proxyPort, '127.0.0.1');
				const chunks: string[] = [];

				client.on('connect', () => {
					client.write(createWebSocketUpgradeRequest('/api/agents', '127.0.0.1', proxyPort));
				});

				client.on('data', (data) => {
					chunks.push(data.toString());
					client.end();
				});

				client.on('end', () => resolve(chunks.join('')));
				client.on('error', reject);

				setTimeout(() => {
					client.destroy();
					reject(new Error('Timeout'));
				}, 2000);
			});

			// Should have been routed to Bun backend
			expect(response).toContain('[BUN]');

			// Clean up
			await new Promise<void>((resolve) => proxy.close(() => resolve()));
			await new Promise<void>((resolve) => viteServer.close(() => resolve()));
			await new Promise<void>((resolve) => backendServer.close(() => resolve()));
		});

		test('routes WebSocket upgrade for /_agentuity to backend', async () => {
			const { startWsProxy } = await import(wsProxyPath);

			const proxyPort = await findAvailablePort(14300);
			const vitePort = await findAvailablePort(proxyPort + 1);
			const backendPort = await findAvailablePort(vitePort + 1);

			const viteServer = await createEchoServer(vitePort, 'VITE');
			const backendServer = await createEchoServer(backendPort, 'BUN');

			const proxy = await startWsProxy({
				port: proxyPort,
				vitePort,
				backendPort,
				routePaths: ['/api'],
				logger: mockLogger,
			});

			// Send WebSocket upgrade request for /_agentuity path (always goes to backend)
			const response = await new Promise<string>((resolve, reject) => {
				const client = connect(proxyPort, '127.0.0.1');
				const chunks: string[] = [];

				client.on('connect', () => {
					client.write(
						createWebSocketUpgradeRequest('/_agentuity/stream', '127.0.0.1', proxyPort)
					);
				});

				client.on('data', (data) => {
					chunks.push(data.toString());
					client.end();
				});

				client.on('end', () => resolve(chunks.join('')));
				client.on('error', reject);

				setTimeout(() => {
					client.destroy();
					reject(new Error('Timeout'));
				}, 2000);
			});

			// Should have been routed to Bun backend
			expect(response).toContain('[BUN]');

			// Clean up
			await new Promise<void>((resolve) => proxy.close(() => resolve()));
			await new Promise<void>((resolve) => viteServer.close(() => resolve()));
			await new Promise<void>((resolve) => backendServer.close(() => resolve()));
		});

		test('routes WebSocket upgrade for non-backend paths to Vite', async () => {
			const { startWsProxy } = await import(wsProxyPath);

			const proxyPort = await findAvailablePort(14400);
			const vitePort = await findAvailablePort(proxyPort + 1);
			const backendPort = await findAvailablePort(vitePort + 1);

			const viteServer = await createEchoServer(vitePort, 'VITE');
			const backendServer = await createEchoServer(backendPort, 'BUN');

			const proxy = await startWsProxy({
				port: proxyPort,
				vitePort,
				backendPort,
				routePaths: ['/api'],
				logger: mockLogger,
			});

			// Send WebSocket upgrade request for a path that should go to Vite (HMR)
			const response = await new Promise<string>((resolve, reject) => {
				const client = connect(proxyPort, '127.0.0.1');
				const chunks: string[] = [];

				client.on('connect', () => {
					client.write(createWebSocketUpgradeRequest('/', '127.0.0.1', proxyPort));
				});

				client.on('data', (data) => {
					chunks.push(data.toString());
					client.end();
				});

				client.on('end', () => resolve(chunks.join('')));
				client.on('error', reject);

				setTimeout(() => {
					client.destroy();
					reject(new Error('Timeout'));
				}, 2000);
			});

			// Should have been routed to Vite (for HMR WebSocket)
			expect(response).toContain('[VITE]');

			// Clean up
			await new Promise<void>((resolve) => proxy.close(() => resolve()));
			await new Promise<void>((resolve) => viteServer.close(() => resolve()));
			await new Promise<void>((resolve) => backendServer.close(() => resolve()));
		});

		test('routes custom route paths to backend', async () => {
			const { startWsProxy } = await import(wsProxyPath);

			const proxyPort = await findAvailablePort(14500);
			const vitePort = await findAvailablePort(proxyPort + 1);
			const backendPort = await findAvailablePort(vitePort + 1);

			const viteServer = await createEchoServer(vitePort, 'VITE');
			const backendServer = await createEchoServer(backendPort, 'BUN');

			// Custom route paths (e.g., user defined /graphql, /rpc)
			const proxy = await startWsProxy({
				port: proxyPort,
				vitePort,
				backendPort,
				routePaths: ['/api', '/graphql', '/rpc'],
				logger: mockLogger,
			});

			// Test /graphql path
			const response = await new Promise<string>((resolve, reject) => {
				const client = connect(proxyPort, '127.0.0.1');
				const chunks: string[] = [];

				client.on('connect', () => {
					client.write(createWebSocketUpgradeRequest('/graphql', '127.0.0.1', proxyPort));
				});

				client.on('data', (data) => {
					chunks.push(data.toString());
					client.end();
				});

				client.on('end', () => resolve(chunks.join('')));
				client.on('error', reject);

				setTimeout(() => {
					client.destroy();
					reject(new Error('Timeout'));
				}, 2000);
			});

			expect(response).toContain('[BUN]');

			// Clean up
			await new Promise<void>((resolve) => proxy.close(() => resolve()));
			await new Promise<void>((resolve) => viteServer.close(() => resolve()));
			await new Promise<void>((resolve) => backendServer.close(() => resolve()));
		});

		test('handles sub-paths correctly (/api/agents routes to backend)', async () => {
			const { startWsProxy } = await import(wsProxyPath);

			const proxyPort = await findAvailablePort(14600);
			const vitePort = await findAvailablePort(proxyPort + 1);
			const backendPort = await findAvailablePort(vitePort + 1);

			const viteServer = await createEchoServer(vitePort, 'VITE');
			const backendServer = await createEchoServer(backendPort, 'BUN');

			const proxy = await startWsProxy({
				port: proxyPort,
				vitePort,
				backendPort,
				routePaths: ['/api'],
				logger: mockLogger,
			});

			// Test sub-path /api/agents/123
			const response = await new Promise<string>((resolve, reject) => {
				const client = connect(proxyPort, '127.0.0.1');
				const chunks: string[] = [];

				client.on('connect', () => {
					client.write(
						createWebSocketUpgradeRequest(
							'/api/agents/123/conversation',
							'127.0.0.1',
							proxyPort
						)
					);
				});

				client.on('data', (data) => {
					chunks.push(data.toString());
					client.end();
				});

				client.on('end', () => resolve(chunks.join('')));
				client.on('error', reject);

				setTimeout(() => {
					client.destroy();
					reject(new Error('Timeout'));
				}, 2000);
			});

			expect(response).toContain('[BUN]');

			// Clean up
			await new Promise<void>((resolve) => proxy.close(() => resolve()));
			await new Promise<void>((resolve) => viteServer.close(() => resolve()));
			await new Promise<void>((resolve) => backendServer.close(() => resolve()));
		});

		test('does not route partial path matches (/ap is not /api)', async () => {
			const { startWsProxy } = await import(wsProxyPath);

			const proxyPort = await findAvailablePort(14700);
			const vitePort = await findAvailablePort(proxyPort + 1);
			const backendPort = await findAvailablePort(vitePort + 1);

			const viteServer = await createEchoServer(vitePort, 'VITE');
			const backendServer = await createEchoServer(backendPort, 'BUN');

			const proxy = await startWsProxy({
				port: proxyPort,
				vitePort,
				backendPort,
				routePaths: ['/api'],
				logger: mockLogger,
			});

			// /ap is NOT /api - should go to Vite
			const response = await new Promise<string>((resolve, reject) => {
				const client = connect(proxyPort, '127.0.0.1');
				const chunks: string[] = [];

				client.on('connect', () => {
					client.write(createHttpRequest('/ap', '127.0.0.1', proxyPort));
				});

				client.on('data', (data) => {
					chunks.push(data.toString());
					client.end();
				});

				client.on('end', () => resolve(chunks.join('')));
				client.on('error', reject);

				setTimeout(() => {
					client.destroy();
					reject(new Error('Timeout'));
				}, 2000);
			});

			expect(response).toContain('[VITE]');

			// Clean up
			await new Promise<void>((resolve) => proxy.close(() => resolve()));
			await new Promise<void>((resolve) => viteServer.close(() => resolve()));
			await new Promise<void>((resolve) => backendServer.close(() => resolve()));
		});
	});

	describe('error handling', () => {
		test('handles client disconnect before data is sent', async () => {
			const { startWsProxy } = await import(wsProxyPath);

			const proxyPort = await findAvailablePort(14800);
			const vitePort = await findAvailablePort(proxyPort + 1);
			const backendPort = await findAvailablePort(vitePort + 1);

			const viteServer = await createEchoServer(vitePort, 'VITE');
			const backendServer = await createEchoServer(backendPort, 'BUN');

			const proxy = await startWsProxy({
				port: proxyPort,
				vitePort,
				backendPort,
				routePaths: ['/api'],
				logger: mockLogger,
			});

			// Connect and immediately disconnect
			await new Promise<void>((resolve) => {
				const client = connect(proxyPort, '127.0.0.1');
				client.on('connect', () => {
					client.destroy(); // Immediate disconnect
				});
				client.on('close', () => resolve());

				// Timeout fallback
				setTimeout(resolve, 500);
			});

			// Proxy should still be running
			expect(proxy.listening).toBe(true);

			// Clean up
			await new Promise<void>((resolve) => proxy.close(() => resolve()));
			await new Promise<void>((resolve) => viteServer.close(() => resolve()));
			await new Promise<void>((resolve) => backendServer.close(() => resolve()));
		});

		test('handles target server not responding gracefully', async () => {
			const { startWsProxy } = await import(wsProxyPath);

			const proxyPort = await findAvailablePort(14900);
			const vitePort = await findAvailablePort(proxyPort + 1);
			const backendPort = await findAvailablePort(vitePort + 1);

			// Only start backend, NOT vite - simulating vite not available
			const backendServer = await createEchoServer(backendPort, 'BUN');

			const proxy = await startWsProxy({
				port: proxyPort,
				vitePort,
				backendPort,
				routePaths: ['/api'],
				logger: mockLogger,
			});

			// Try to connect (should not hang)
			await new Promise<void>((resolve, _reject) => {
				const client = connect(proxyPort, '127.0.0.1');

				client.on('connect', () => {
					client.write(createHttpRequest('/test', '127.0.0.1', proxyPort));
				});

				client.on('error', () => {
					// Connection error is expected
					resolve();
				});

				client.on('close', () => {
					resolve();
				});

				// Should not hang - timeout is safety
				setTimeout(() => {
					client.destroy();
					resolve();
				}, 1000);
			});

			// Proxy should still be running
			expect(proxy.listening).toBe(true);

			// Clean up
			await new Promise<void>((resolve) => proxy.close(() => resolve()));
			await new Promise<void>((resolve) => backendServer.close(() => resolve()));
		});
	});

	describe('URL parsing', () => {
		test('handles query strings in WebSocket upgrade paths', async () => {
			const { startWsProxy } = await import(wsProxyPath);

			const proxyPort = await findAvailablePort(15000);
			const vitePort = await findAvailablePort(proxyPort + 1);
			const backendPort = await findAvailablePort(vitePort + 1);

			const viteServer = await createEchoServer(vitePort, 'VITE');
			const backendServer = await createEchoServer(backendPort, 'BUN');

			const proxy = await startWsProxy({
				port: proxyPort,
				vitePort,
				backendPort,
				routePaths: ['/api'],
				logger: mockLogger,
			});

			// WebSocket upgrade with query string
			const response = await new Promise<string>((resolve, reject) => {
				const client = connect(proxyPort, '127.0.0.1');
				const chunks: string[] = [];

				client.on('connect', () => {
					client.write(
						createWebSocketUpgradeRequest(
							'/api/stream?session=abc123&token=xyz',
							'127.0.0.1',
							proxyPort
						)
					);
				});

				client.on('data', (data) => {
					chunks.push(data.toString());
					client.end();
				});

				client.on('end', () => resolve(chunks.join('')));
				client.on('error', reject);

				setTimeout(() => {
					client.destroy();
					reject(new Error('Timeout'));
				}, 2000);
			});

			// Query string should be stripped for path matching
			expect(response).toContain('[BUN]');

			// Clean up
			await new Promise<void>((resolve) => proxy.close(() => resolve()));
			await new Promise<void>((resolve) => viteServer.close(() => resolve()));
			await new Promise<void>((resolve) => backendServer.close(() => resolve()));
		});

		test('handles POST method in request line', async () => {
			const { startWsProxy } = await import(wsProxyPath);

			const proxyPort = await findAvailablePort(15100);
			const vitePort = await findAvailablePort(proxyPort + 1);
			const backendPort = await findAvailablePort(vitePort + 1);

			const viteServer = await createEchoServer(vitePort, 'VITE');
			const backendServer = await createEchoServer(backendPort, 'BUN');

			const proxy = await startWsProxy({
				port: proxyPort,
				vitePort,
				backendPort,
				routePaths: ['/api'],
				logger: mockLogger,
			});

			// POST request (not WebSocket upgrade)
			const request = [
				'POST /api/agents HTTP/1.1',
				`Host: 127.0.0.1:${proxyPort}`,
				'Content-Type: application/json',
				'Content-Length: 13',
				'\r\n',
				'{"test":true}',
			].join('\r\n');

			const response = await new Promise<string>((resolve, reject) => {
				const client = connect(proxyPort, '127.0.0.1');
				const chunks: string[] = [];

				client.on('connect', () => {
					client.write(request);
				});

				client.on('data', (data) => {
					chunks.push(data.toString());
					client.end();
				});

				client.on('end', () => resolve(chunks.join('')));
				client.on('error', reject);

				setTimeout(() => {
					client.destroy();
					reject(new Error('Timeout'));
				}, 2000);
			});

			// POST without upgrade goes to Vite (not backend)
			expect(response).toContain('[VITE]');

			// Clean up
			await new Promise<void>((resolve) => proxy.close(() => resolve()));
			await new Promise<void>((resolve) => viteServer.close(() => resolve()));
			await new Promise<void>((resolve) => backendServer.close(() => resolve()));
		});
	});

	describe('closeAll() shutdown semantics', () => {
		// These tests verify the orphan-prevention fix: server.close() alone
		// only stops accepting new connections, but leaves piped sockets (HMR
		// WebSocket, backend WS) holding the listening port bound. closeAll()
		// must destroy live sockets first so the user-facing port is released
		// immediately on dev-mode shutdown.

		test('exposes a closeAll() method that resolves with no connections', async () => {
			const { startWsProxy } = await import(wsProxyPath);

			const proxyPort = await findAvailablePort(15500);
			const vitePort = await findAvailablePort(proxyPort + 1);
			const backendPort = await findAvailablePort(vitePort + 1);

			const viteServer = await createEchoServer(vitePort, 'VITE');
			const backendServer = await createEchoServer(backendPort, 'BUN');

			const proxy = await startWsProxy({
				port: proxyPort,
				vitePort,
				backendPort,
				routePaths: ['/api'],
				logger: mockLogger,
			});

			expect(typeof proxy.closeAll).toBe('function');
			await proxy.closeAll();
			expect(proxy.listening).toBe(false);

			await new Promise<void>((resolve) => viteServer.close(() => resolve()));
			await new Promise<void>((resolve) => backendServer.close(() => resolve()));
		});

		test('closeAll() releases the listening port (rebindable immediately)', async () => {
			const { startWsProxy } = await import(wsProxyPath);

			const proxyPort = await findAvailablePort(15600);
			const vitePort = await findAvailablePort(proxyPort + 1);
			const backendPort = await findAvailablePort(vitePort + 1);

			const viteServer = await createEchoServer(vitePort, 'VITE');
			const backendServer = await createEchoServer(backendPort, 'BUN');

			const proxy = await startWsProxy({
				port: proxyPort,
				vitePort,
				backendPort,
				routePaths: ['/api'],
				logger: mockLogger,
			});

			await proxy.closeAll();

			// We must be able to bind the same port immediately.
			await new Promise<void>((resolve, reject) => {
				const rebind = createServer();
				rebind.once('error', reject);
				rebind.listen(proxyPort, '127.0.0.1', () => {
					rebind.close(() => resolve());
				});
			});

			await new Promise<void>((resolve) => viteServer.close(() => resolve()));
			await new Promise<void>((resolve) => backendServer.close(() => resolve()));
		});

		test('plain close() does NOT finish while a piped WebSocket is open', async () => {
			// Establishes the orphan condition closeAll() must fix: native
			// `Server.close(cb)` only stops accepting new connections — the
			// callback does not fire until every active socket has closed.
			// With long-lived HMR / backend WebSockets piped through the proxy
			// this means dev-mode shutdown would hang indefinitely waiting for
			// the listener to release the port.
			const { startWsProxy } = await import(wsProxyPath);

			const proxyPort = await findAvailablePort(15700);
			const vitePort = await findAvailablePort(proxyPort + 1);
			const backendPort = await findAvailablePort(vitePort + 1);

			// Backend that never closes the socket — simulates a long-lived WS.
			const stickyBackend = await new Promise<Server>((resolve, reject) => {
				const s = createServer((sock) => {
					sock.on('data', () => {
						/* keep alive, never respond, never close */
					});
					sock.on('error', () => {});
				});
				s.on('error', reject);
				s.listen(backendPort, '127.0.0.1', () => resolve(s));
			});

			const viteServer = await createEchoServer(vitePort, 'VITE');

			const proxy = await startWsProxy({
				port: proxyPort,
				vitePort,
				backendPort,
				routePaths: ['/api'],
				logger: mockLogger,
			});

			// Open a WebSocket upgrade to the backend and keep the client alive.
			const client = await new Promise<ReturnType<typeof connect>>((resolve, reject) => {
				const c = connect(proxyPort, '127.0.0.1');
				c.once('error', reject);
				c.once('connect', () => {
					c.write(createWebSocketUpgradeRequest('/api/stream', '127.0.0.1', proxyPort));
					setTimeout(() => resolve(c), 100);
				});
			});

			// Trigger native close() and watch for the callback. It must NOT
			// fire while the WebSocket is still piped — that's the orphan
			// condition the closeAll() fix addresses.
			let closeCallbackFired = false;
			proxy.close(() => {
				closeCallbackFired = true;
			});
			await new Promise<void>((resolve) => setTimeout(resolve, 200));
			expect(closeCallbackFired).toBe(false);

			// Dropping the client lets close() finally complete — confirms it
			// really was waiting on the WebSocket and not on something else.
			client.destroy();
			await new Promise<void>((resolve) => setTimeout(resolve, 200));
			expect(closeCallbackFired).toBe(true);

			await new Promise<void>((resolve) => viteServer.close(() => resolve()));
			await new Promise<void>((resolve) => stickyBackend.close(() => resolve()));
		});

		test('closeAll() releases the port even with a long-lived WebSocket open', async () => {
			// The fix: closeAll() destroys live piped sockets first, so the
			// listening port is released immediately, regardless of any open
			// HMR/backend WebSockets. This is the central orphan-prevention
			// guarantee for the front-door proxy on dev-mode shutdown.
			const { startWsProxy } = await import(wsProxyPath);

			const proxyPort = await findAvailablePort(15800);
			const vitePort = await findAvailablePort(proxyPort + 1);
			const backendPort = await findAvailablePort(vitePort + 1);

			const stickyBackend = await new Promise<Server>((resolve, reject) => {
				const s = createServer((sock) => {
					sock.on('data', () => {});
					sock.on('error', () => {});
				});
				s.on('error', reject);
				s.listen(backendPort, '127.0.0.1', () => resolve(s));
			});

			const viteServer = await createEchoServer(vitePort, 'VITE');

			const proxy = await startWsProxy({
				port: proxyPort,
				vitePort,
				backendPort,
				routePaths: ['/api'],
				logger: mockLogger,
			});

			// Open a WS upgrade and keep the client alive; the proxy will
			// pipe it to the sticky backend that never closes.
			const client = await new Promise<ReturnType<typeof connect>>((resolve, reject) => {
				const c = connect(proxyPort, '127.0.0.1');
				c.once('error', reject);
				c.once('connect', () => {
					c.write(createWebSocketUpgradeRequest('/api/stream', '127.0.0.1', proxyPort));
					setTimeout(() => resolve(c), 100);
				});
			});

			// closeAll() must complete promptly even with the WS open.
			const start = Date.now();
			await proxy.closeAll();
			const elapsed = Date.now() - start;

			// Generous bound — we only need to confirm it didn't hang on the
			// open client connection. With socket.destroy() this should be ~ms.
			expect(elapsed).toBeLessThan(500);
			expect(proxy.listening).toBe(false);

			// And the port must be immediately rebindable — the actual orphan
			// symptom we're preventing.
			await new Promise<void>((resolve, reject) => {
				const rebind = createServer();
				rebind.once('error', reject);
				rebind.listen(proxyPort, '127.0.0.1', () => {
					rebind.close(() => resolve());
				});
			});

			// The piped client socket should have been destroyed by closeAll().
			// Wait briefly for the close event to propagate to the client side.
			await new Promise<void>((resolve) => {
				if (client.destroyed) return resolve();
				client.once('close', () => resolve());
				setTimeout(resolve, 200);
			});
			expect(client.destroyed).toBe(true);

			await new Promise<void>((resolve) => viteServer.close(() => resolve()));
			await new Promise<void>((resolve) => stickyBackend.close(() => resolve()));
		});

		test('closeAll() lets you immediately bind a fresh proxy on the same port (the orphan-prevention guarantee)', async () => {
			// In-process equivalent of the spawn / kill / respawn cycle from
			// dev-respawn.test.ts, but exercising only the proxy. This is the
			// scenario where the closeAll() fix matters most: the parent
			// process stays alive across cleanup, so we don't get the
			// kernel-on-process-exit safety net. Without closeAll(), an open
			// piped WebSocket would keep the listener bound and the second
			// startWsProxy() on the same port would fail with EADDRINUSE.
			const { startWsProxy } = await import(wsProxyPath);

			const proxyPort = await findAvailablePort(15850);
			const vitePort = await findAvailablePort(proxyPort + 1);
			const backendPort = await findAvailablePort(vitePort + 1);

			const stickyBackend = await new Promise<Server>((resolve, reject) => {
				const s = createServer((sock) => {
					sock.on('data', () => {});
					sock.on('error', () => {});
				});
				s.on('error', reject);
				s.listen(backendPort, '127.0.0.1', () => resolve(s));
			});

			const viteServer = await createEchoServer(vitePort, 'VITE');

			const proxy1 = await startWsProxy({
				port: proxyPort,
				vitePort,
				backendPort,
				routePaths: ['/api'],
				logger: mockLogger,
			});

			// Open the long-lived WS that would otherwise leak the listener.
			const client = await new Promise<ReturnType<typeof connect>>((resolve, reject) => {
				const c = connect(proxyPort, '127.0.0.1');
				c.once('error', reject);
				c.once('connect', () => {
					c.write(createWebSocketUpgradeRequest('/api/stream', '127.0.0.1', proxyPort));
					setTimeout(() => resolve(c), 100);
				});
			});

			await proxy1.closeAll();

			// Immediate respawn on the same port — must succeed.
			const proxy2 = await startWsProxy({
				port: proxyPort,
				vitePort,
				backendPort,
				routePaths: ['/api'],
				logger: mockLogger,
			});
			expect(proxy2.listening).toBe(true);

			await proxy2.closeAll();
			try {
				client.destroy();
			} catch {
				// already dead
			}
			await new Promise<void>((resolve) => viteServer.close(() => resolve()));
			await new Promise<void>((resolve) => stickyBackend.close(() => resolve()));
		});

		test('closeAll() is idempotent', async () => {
			const { startWsProxy } = await import(wsProxyPath);

			const proxyPort = await findAvailablePort(15900);
			const vitePort = await findAvailablePort(proxyPort + 1);
			const backendPort = await findAvailablePort(vitePort + 1);

			const viteServer = await createEchoServer(vitePort, 'VITE');
			const backendServer = await createEchoServer(backendPort, 'BUN');

			const proxy = await startWsProxy({
				port: proxyPort,
				vitePort,
				backendPort,
				routePaths: ['/api'],
				logger: mockLogger,
			});

			await proxy.closeAll();
			// Second call must not throw.
			await proxy.closeAll();
			expect(proxy.listening).toBe(false);

			await new Promise<void>((resolve) => viteServer.close(() => resolve()));
			await new Promise<void>((resolve) => backendServer.close(() => resolve()));
		});
	});
});
