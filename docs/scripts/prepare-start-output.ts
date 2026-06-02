import { access, writeFile } from 'node:fs/promises';

const serverBundleUrl = new URL('../dist/server/server.js', import.meta.url);
const clientBundleUrl = new URL('../dist/client/', import.meta.url);
const launchServerUrl = new URL('../dist/server.js', import.meta.url);

const launchServer = String.raw`import { relative, join, normalize } from 'node:path';
import { websocket } from 'hono/bun';
import server from './server/server.js';

const clientRoot = join(import.meta.dir, 'client');
const hostname = process.env.HOST ?? '0.0.0.0';
const port = Number.parseInt(process.env.PORT ?? '3000', 10);

const contentTypes = new Map([
	['.css', 'text/css; charset=utf-8'],
	['.js', 'text/javascript; charset=utf-8'],
	['.mjs', 'text/javascript; charset=utf-8'],
	['.json', 'application/json; charset=utf-8'],
	['.txt', 'text/plain; charset=utf-8'],
	['.xml', 'application/xml; charset=utf-8'],
	['.svg', 'image/svg+xml'],
	['.ico', 'image/x-icon'],
	['.png', 'image/png'],
	['.jpg', 'image/jpeg'],
	['.jpeg', 'image/jpeg'],
	['.webp', 'image/webp'],
	['.woff', 'font/woff'],
	['.woff2', 'font/woff2'],
]);

const immutableAssetPattern = /^assets[/\\].+-[A-Za-z0-9_-]{8,}\.[^.]+$/;

function contentTypeFor(pathname) {
	const dotIndex = pathname.lastIndexOf('.');
	if (dotIndex === -1) return 'application/octet-stream';
	return contentTypes.get(pathname.slice(dotIndex).toLowerCase()) ?? 'application/octet-stream';
}

function cacheControlFor(relativePath) {
	return immutableAssetPattern.test(relativePath)
		? 'public, max-age=31536000, immutable'
		: 'no-store';
}

function staticHeadersFor(relativePath, filePath) {
	return {
		'cache-control': cacheControlFor(relativePath),
		'content-type': contentTypeFor(filePath),
	};
}

function clientFile(pathname) {
	let decodedPath;
	try {
		decodedPath = decodeURIComponent(pathname);
	} catch {
		return undefined;
	}

	const normalizedPath = normalize(decodedPath).replace(/^[/\\]+/, '');
	if (!normalizedPath || normalizedPath.startsWith('..')) return undefined;

	const filePath = join(clientRoot, normalizedPath);
	const relativePath = relative(clientRoot, filePath);
	if (relativePath === '' || relativePath.startsWith('..')) return undefined;
	return { filePath, relativePath };
}

async function serveStatic(pathname) {
	const resolved = clientFile(pathname);
	if (!resolved) return undefined;

	const file = Bun.file(resolved.filePath);
	if (!(await file.exists())) return undefined;

	return new Response(file, {
		headers: staticHeadersFor(resolved.relativePath, resolved.filePath),
	});
}

const healthPaths = new Set(['/_health', '/_agentuity/health', '/__health']);

function healthResponse(request) {
	if (request.method !== 'GET' && request.method !== 'HEAD') return undefined;

	const url = new URL(request.url);
	if (!healthPaths.has(url.pathname)) return undefined;

	return new Response(null, {
		status: 200,
		headers: {
			'cache-control': 'no-store',
			'content-type': 'text/plain; charset=utf-8',
		},
	});
}

const startFetch = server.fetch.bind(server);

Bun.serve({
	hostname,
	port,
	websocket,
	async fetch(request, bunServer) {
		const health = healthResponse(request);
		if (health) return health;

		const url = new URL(request.url);
		if (request.method === 'GET' || request.method === 'HEAD') {
			const staticResponse = await serveStatic(url.pathname);
			if (staticResponse) return staticResponse;
		}

		return startFetch(request, bunServer);
	},
});

console.log('TanStack Start docs server listening on http://' + hostname + ':' + port);
`;

export function createLaunchServer(): string {
	return launchServer;
}

async function assertPathExists(url: URL, label: string): Promise<void> {
	try {
		await access(url);
	} catch {
		throw new Error(`${label} missing at ${url.pathname}`);
	}
}

export async function prepareStartOutput(): Promise<void> {
	await assertPathExists(serverBundleUrl, 'TanStack Start server bundle');
	await assertPathExists(clientBundleUrl, 'TanStack Start client bundle');
	await writeFile(launchServerUrl, createLaunchServer(), 'utf-8');

	console.log('Prepared dist/server.js for Agentuity launch metadata.');
}

if (import.meta.main) {
	await prepareStartOutput();
}
