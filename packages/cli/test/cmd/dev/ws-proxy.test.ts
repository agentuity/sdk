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
				socket.write(`[${label}] ${data.toString()}`);
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
});
