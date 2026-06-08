import { defaultRenderHandler } from '@tanstack/react-router/ssr/server';
import { createStartHandler } from '@tanstack/react-start/server';
import { createServerEntry } from '@tanstack/react-start/server-entry';
import { docRedirectRules, getDemoRedirectTarget } from './lib/docs-redirects';

const startHandler = createStartHandler(defaultRenderHandler);

const legacyRedirects = new Map<string, string>(
	docRedirectRules.flatMap((rule) => rule.paths.map((path) => [path, rule.target] as const))
);

function redirect(location: string): Response {
	return new Response(null, {
		status: 301,
		headers: { location },
	});
}

function legacyRedirectTarget(pathname: string): string | undefined {
	const exactTarget = legacyRedirects.get(pathname);
	if (exactTarget) {
		return exactTarget;
	}

	if (pathname.startsWith('/demo/')) {
		return getDemoRedirectTarget(pathname.replace(/^\/demo\/?/, ''));
	}

	return undefined;
}

async function fetchDocsApi(request: Request, opts: unknown): Promise<Response> {
	const { docsApiApp } = await import('../api/app');
	return docsApiApp.fetch(request, opts);
}

const startEntry = createServerEntry({
	async fetch(request, opts) {
		const url = new URL(request.url);

		if (url.pathname.startsWith('/api/')) {
			return fetchDocsApi(request, opts);
		}

		const target = legacyRedirectTarget(url.pathname);

		if (target) {
			return redirect(target);
		}

		return startHandler(request, opts);
	},
});

export default startEntry;
