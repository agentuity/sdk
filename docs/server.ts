import { join, normalize } from 'node:path';
import { docRedirectRules, getDemoRedirectTarget } from './src/web/lib/docs-redirects';

const PORT = Number.parseInt(process.env.PORT ?? '3000', 10);
const INDEX_FILE = join(import.meta.dir, 'src/web/index.html');

function redirect(location: string): Response {
	return new Response(null, {
		status: 301,
		headers: { location },
	});
}

function matchesPath(paths: readonly string[], pathname: string): boolean {
	return paths.includes(pathname);
}

function contentType(pathname: string): string | undefined {
	if (pathname.endsWith('.html')) return 'text/html; charset=utf-8';
	if (pathname.endsWith('.js')) return 'text/javascript; charset=utf-8';
	if (pathname.endsWith('.css')) return 'text/css; charset=utf-8';
	if (pathname.endsWith('.json')) return 'application/json; charset=utf-8';
	if (pathname.endsWith('.txt')) return 'text/plain; charset=utf-8';
	if (pathname.endsWith('.xml')) return 'application/xml; charset=utf-8';
	if (pathname.endsWith('.ico')) return 'image/x-icon';
	if (pathname.endsWith('.svg')) return 'image/svg+xml';
	if (pathname.endsWith('.png')) return 'image/png';
	if (pathname.endsWith('.webp')) return 'image/webp';
	if (pathname.endsWith('.woff')) return 'font/woff';
	if (pathname.endsWith('.woff2')) return 'font/woff2';
	return undefined;
}

async function staticFile(pathname: string): Promise<Response | null> {
	const normalized = normalize(decodeURIComponent(pathname)).replace(/^(\.\.(\/|\\|$))+/, '');
	const file = Bun.file(join(import.meta.dir, normalized));

	if (!(await file.exists())) {
		return null;
	}

	const type = contentType(pathname);

	return new Response(file, {
		headers: type ? { 'content-type': type } : undefined,
	});
}

Bun.serve({
	port: PORT,
	hostname: '0.0.0.0',
	async fetch(request) {
		const url = new URL(request.url);

		for (const rule of docRedirectRules) {
			if (matchesPath(rule.paths, url.pathname)) {
				return redirect(rule.target);
			}
		}

		if (url.pathname.startsWith('/demo/')) {
			return redirect(getDemoRedirectTarget(url.pathname.replace(/^\/demo\/?/, '')));
		}

		if (url.pathname === '/demo') {
			return redirect(getDemoRedirectTarget(undefined));
		}

		const fileResponse = await staticFile(
			url.pathname === '/' ? '/src/web/index.html' : url.pathname
		);
		if (fileResponse) {
			return fileResponse;
		}

		return new Response(Bun.file(INDEX_FILE), {
			headers: { 'content-type': 'text/html; charset=utf-8' },
		});
	},
});

console.log(`Docs server running on http://localhost:${PORT}`);
