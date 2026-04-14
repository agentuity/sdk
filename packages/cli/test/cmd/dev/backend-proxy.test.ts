import { describe, test, expect } from 'bun:test';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';

const viteConfigPath = join(
	import.meta.dir,
	'../../../src/cmd/build/vite/vite-asset-server-config.ts'
);

/**
 * Helper to find an available port.
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
 * Extract the configure callback from a generated Vite config's proxy entry.
 *
 * The `generateAssetServerConfig` returns the full Vite config including
 * `server.proxy`. We pull out the `configure` function from a proxy entry
 * so we can test it in isolation.
 */
async function getProxyConfigure(routePath: string = '/api'): Promise<{
	configure: (proxy: any, options: any) => void;
	target: string;
}> {
	const { generateAssetServerConfig } = await import(viteConfigPath);

	const mockLogger = {
		debug: () => {},
		info: () => {},
		warn: () => {},
		error: () => {},
		hasErrorLogged: () => false,
		hasWarned: false,
		clearScreen: () => {},
		warnOnce: () => {},
	};

	const backendPort = 39999;
	const config = await generateAssetServerConfig({
		rootDir: '/tmp/test',
		logger: mockLogger as any,
		port: 3502,
		backendPort,
		routePaths: [routePath],
	});

	const proxyEntry = config.server?.proxy?.[routePath] as any;
	expect(proxyEntry).toBeDefined();
	expect(proxyEntry.configure).toBeDefined();
	expect(proxyEntry.target).toBe(`http://127.0.0.1:${backendPort}`);

	return {
		configure: proxyEntry.configure,
		target: proxyEntry.target,
	};
}

/**
 * Simulate an http-proxy error event on a mock proxy object.
 *
 * Returns the response object so we can assert on its state.
 */
function simulateProxyError(
	configure: (proxy: any, options: any) => void,
	errorCode: string,
	hasResponse: boolean = true
): {
	proxy: any;
	res: Record<string, any>;
	capturedEvents: string[];
} {
	const res: Record<string, any> = {
		writableEnded: false,
		statusCode: 200,
		headers: {} as Record<string, string>,
		setHeader: function (name: string, value: string) {
			this.headers[name] = value;
		},
		end: function (chunk: string) {
			this.writableEnded = true;
			this.body = chunk;
		},
		body: '',
	};

	const capturedEvents: string[] = [];

	// Create a mock EventEmitter-like proxy
	const proxy = {
		listeners: {} as Record<string, Function[]>,
		on(event: string, handler: Function) {
			if (!this.listeners[event]) this.listeners[event] = [];
			this.listeners[event].push(handler);
		},
		emit(event: string, ...args: unknown[]) {
			capturedEvents.push(event);
			for (const handler of this.listeners[event] ?? []) {
				handler(...args);
			}
		},
	};

	// Call configure to register the error handler
	configure(proxy, { target: 'http://127.0.0.1:39999' });

	// Emit the error event, simulating http-proxy behavior
	const err = new Error(`connect ECONNREFUSED 127.0.0.1:39999`);
	(err as any).code = errorCode;

	proxy.emit('error', err, {}, hasResponse ? res : null);

	return { proxy, res, capturedEvents };
}

describe('Backend Proxy ECONNREFUSED Handler', () => {
	describe('backendProxyOptions configure callback', () => {
		test('returns 503 with JSON body on ECONNREFUSED', async () => {
			const { configure } = await getProxyConfigure('/api');

			const { res } = simulateProxyError(configure, 'ECONNREFUSED');

			expect(res.statusCode).toBe(503);
			expect(res.headers['Content-Type']).toBe('application/json');
			expect(res.writableEnded).toBe(true);

			const body = JSON.parse(res.body);
			expect(body.error).toBe('Backend unavailable');
			expect(body.message).toContain('not ready yet');
			expect(body.retry).toBe(true);
		});

		test('does not write response if already ended', async () => {
			const { configure } = await getProxyConfigure('/api');

			const res = {
				writableEnded: true,
				statusCode: 200,
				headers: {} as Record<string, string>,
				setHeader: function (name: string, value: string) {
					this.headers[name] = value;
				},
				end: (_chunk: string) => {
					throw new Error('Should not call end() on already-ended response');
				},
				body: '',
			};

			const proxy = {
				listeners: {} as Record<string, Function[]>,
				on(event: string, handler: Function) {
					if (!this.listeners[event]) this.listeners[event] = [];
					this.listeners[event].push(handler);
				},
				emit(event: string, ...args: unknown[]) {
					for (const handler of this.listeners[event] ?? []) {
						handler(...args);
					}
				},
			};

			configure(proxy, { target: 'http://127.0.0.1:39999' });

			const err = new Error('connect ECONNREFUSED');
			(err as any).code = 'ECONNREFUSED';

			// Should NOT throw even though response is already ended
			expect(() => proxy.emit('error', err, {}, res)).not.toThrow();

			// Response should remain unchanged
			expect(res.statusCode).toBe(200);
		});

		test('ignores non-ECONNREFUSED errors', async () => {
			const { configure } = await getProxyConfigure('/api');

			const res = {
				writableEnded: false,
				statusCode: 200,
				headers: {} as Record<string, string>,
				setHeader: function (name: string, value: string) {
					this.headers[name] = value;
				},
				end: function (chunk: string) {
					this.writableEnded = true;
					this.body = chunk;
				},
				body: '',
			};

			const proxy = {
				listeners: {} as Record<string, Function[]>,
				on(event: string, handler: Function) {
					if (!this.listeners[event]) this.listeners[event] = [];
					this.listeners[event].push(handler);
				},
			};

			configure(proxy, { target: 'http://127.0.0.1:39999' });

			// Emit a non-ECONNREFUSED error (e.g., ETIMEDOUT)
			const err = new Error('connect ETIMEDOUT');
			(err as any).code = 'ETIMEDOUT';

			const handler = proxy.listeners['error']?.[0];
			expect(handler).toBeDefined();

			// Should NOT modify the response for non-ECONNREFUSED
			handler(err, {}, res);
			expect(res.statusCode).toBe(200);
			expect(res.writableEnded).toBe(false);
		});

		test('handles null/undefined response gracefully', async () => {
			const { configure } = await getProxyConfigure('/api');

			const proxy = {
				listeners: {} as Record<string, Function[]>,
				on(event: string, handler: Function) {
					if (!this.listeners[event]) this.listeners[event] = [];
					this.listeners[event].push(handler);
				},
			};

			configure(proxy, { target: 'http://127.0.0.1:39999' });

			const err = new Error('connect ECONNREFUSED');
			(err as any).code = 'ECONNREFUSED';

			const handler = proxy.listeners['error']?.[0];

			// Should not throw when response is null (WebSocket upgrade has no res)
			expect(() => handler(err, {}, null)).not.toThrow();
			expect(() => handler(err, {}, undefined)).not.toThrow();
		});
	});

	describe('all proxy routes have configure callback', () => {
		test('all default proxy entries include ECONNREFUSED handler', async () => {
			const { generateAssetServerConfig } = await import(viteConfigPath);

			const mockLogger = {
				debug: () => {},
				info: () => {},
				warn: () => {},
				error: () => {},
				hasErrorLogged: () => false,
				hasWarned: false,
				clearScreen: () => {},
				warnOnce: () => {},
			};

			const backendPort = 39999;
			const config = await generateAssetServerConfig({
				rootDir: '/tmp/test',
				logger: mockLogger as any,
				port: 3502,
				backendPort,
				routePaths: ['/api', '/graphql'],
				workbenchPath: '/workbench',
			});

			const proxy = config.server?.proxy as Record<string, any>;

			// Every proxy entry should have the configure callback
			for (const [key, entry] of Object.entries(proxy)) {
				expect(
					typeof entry.configure,
					`Proxy entry "${key}" should have configure callback`
				).toBe('function');
				expect(entry.changeOrigin, `Proxy entry "${key}" should have changeOrigin`).toBe(true);
				expect(
					entry.target,
					`Proxy entry "${key}" should target backend port ${backendPort}`
				).toBe(`http://127.0.0.1:${backendPort}`);
			}
		});
	});

	describe('ECONNREFUSED through real HTTP proxy', () => {
		test('Vite proxy returns 503 when backend is not listening', async () => {
			// This is an integration-level test: spin up a real Vite dev server
			// whose proxy target port has nothing listening, and verify the 503.
			//
			// We use node:http to create a minimal server that loads Vite's
			// proxy middleware, then sends a request to it.

			const { generateAssetServerConfig } = await import(viteConfigPath);

			const mockLogger = {
				debug: () => {},
				info: () => {},
				warn: () => {},
				error: () => {},
				hasErrorLogged: () => false,
				hasWarned: false,
				clearScreen: () => {},
				warnOnce: () => {},
			};

			// Use a port with nothing listening as the "backend"
			const deadBackendPort = await findAvailablePort(50000);

			const vitePort = await findAvailablePort(deadBackendPort + 1);

			// Create a temp dir with minimal Vite setup
			const testDir = join(tmpdir(), `vite-proxy-test-${Date.now()}`);
			mkdirSync(testDir, { recursive: true });
			mkdirSync(join(testDir, 'src', 'web'), { recursive: true });
			writeFileSync(join(testDir, 'index.html'), '<html><body></body></html>');

			try {
				const config = await generateAssetServerConfig({
					rootDir: testDir,
					logger: mockLogger as any,
					port: vitePort,
					backendPort: deadBackendPort,
					routePaths: ['/api'],
				});

				// Dynamically import Vite from the repo's node_modules,
				// not from the temp testDir (which has no node_modules).
				const { createRequire } = await import('node:module');
				const projectRequire = createRequire(import.meta.url);

				let viteServer: any;
				try {
					const { createServer } = await import(projectRequire.resolve('vite'));
					viteServer = await createServer(config);
					await viteServer.listen();
				} catch {
					// Vite not available in this test environment — skip integration test
					return;
				}

				try {
					// Make an HTTP request to /api/anything via Vite's proxy
					const response = await fetch(`http://127.0.0.1:${vitePort}/api/test`, {
						signal: AbortSignal.timeout(5000),
					});

					// Should get 503, not 500 or ECONNREFUSED crash
					expect(response.status).toBe(503);

					const body = await response.json();
					expect(body.error).toBe('Backend unavailable');
					expect(body.retry).toBe(true);
				} finally {
					await viteServer.close();
				}
			} finally {
				rmSync(testDir, { recursive: true, force: true });
			}
		});
	});
});

describe('Startup Order Verification', () => {
	test('Bun backend starts before Vite in the dev command flow', async () => {
		// Verify the dev command's step ordering by checking that
		// startBunDevServer is imported and called before startViteAssetServer
		// in the source code ordering.
		//
		// This is a source-level assertion — the actual startup order is
		// determined by the sequential await calls in the handler.

		const devIndexPath = join(import.meta.dir, '../../../src/cmd/dev/index.ts');
		const source = await Bun.file(devIndexPath).text();

		// Find step markers
		const step3Pos = source.indexOf('Step 3: Start Bun backend');
		const step4Pos = source.indexOf('Step 4: Start Vite asset server');
		const step5Pos = source.indexOf('Step 5: Start front-door TCP proxy');

		expect(step3Pos, 'Step 3 (Bun backend) should exist in dev/index.ts').toBeGreaterThan(0);
		expect(step4Pos, 'Step 4 (Vite) should exist in dev/index.ts').toBeGreaterThan(0);
		expect(step5Pos, 'Step 5 (front-door proxy) should exist in dev/index.ts').toBeGreaterThan(0);

		// Bun (Step 3) must come before Vite (Step 4)
		expect(step3Pos, 'Bun backend (Step 3) must start before Vite (Step 4)').toBeLessThan(
			step4Pos
		);

		// Vite (Step 4) must come before front-door proxy (Step 5)
		expect(step4Pos, 'Vite (Step 4) must start before front-door proxy (Step 5)').toBeLessThan(
			step5Pos
		);
	});

	test('vitePort is pre-resolved before Bun starts', async () => {
		const devIndexPath = join(import.meta.dir, '../../../src/cmd/dev/index.ts');
		const source = await Bun.file(devIndexPath).text();

		// Verify vitePort is resolved via findAvailablePort before Bun starts
		const findPortLine = source.indexOf('findAvailablePort(viteInternalPort');
		expect(
			findPortLine,
			'vitePort should be resolved via findAvailablePort before Bun starts'
		).toBeGreaterThan(0);

		// The findAvailablePort call must come before Step 3 (Bun backend)
		const step3Pos = source.indexOf('Step 3: Start Bun backend');
		expect(
			findPortLine,
			'findAvailablePort must be called before Bun starts (Step 3)'
		).toBeLessThan(step3Pos);
	});

	test('env vars use pre-resolved vitePort', async () => {
		const devIndexPath = join(import.meta.dir, '../../../src/cmd/dev/index.ts');
		const source = await Bun.file(devIndexPath).text();

		// Verify AGENTUITY_BASE_URL uses the pre-resolved vitePort
		// We search for a simpler unique pattern to avoid escaping issues
		const baseUrlLine = source.indexOf(
			'AGENTUITY_BASE_URL || `http://localhost:${' + 'vitePort}`'
		);
		expect(baseUrlLine, 'AGENTUITY_BASE_URL should use pre-resolved vitePort').toBeGreaterThan(0);
	});
});
