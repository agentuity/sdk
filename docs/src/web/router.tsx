import { createRouter as createTanStackRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';

function createDocsRouter() {
	return createTanStackRouter({
		routeTree,
		defaultPreload: 'intent',
		scrollRestoration: true,
		scrollToTopSelectors: ['#docs-main-scroll'],
	});
}

export type DocsRouter = ReturnType<typeof createDocsRouter>;

export function getRouter(): DocsRouter {
	return createDocsRouter();
}

export const router = getRouter();

declare module '@tanstack/react-router' {
	interface Register {
		router: ReturnType<typeof getRouter>;
	}
	interface StaticDataRouteOption {
		crumb?: string;
	}
}
