/**
 * Frontend Entry Point - TanStack Router
 *
 * This file sets up the TanStack Router with the generated route tree
 * and renders the application to the DOM.
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider, createRouter } from '@tanstack/react-router';
import { AgentuityProvider } from '@agentuity/react';
import { routeTree } from './routeTree.gen';

const router = createRouter({
	routeTree,
	defaultPreload: 'intent',
	scrollRestoration: true,
});

declare module '@tanstack/react-router' {
	interface Register {
		router: typeof router;
	}
}

const elem = document.getElementById('root')!;
const app = (
	<StrictMode>
		<AgentuityProvider>
			<RouterProvider router={router} />
		</AgentuityProvider>
	</StrictMode>
);

if (import.meta.hot) {
	const root = (import.meta.hot.data.root ??= createRoot(elem));
	root.render(app);
} else {
	createRoot(elem).render(app);
}
