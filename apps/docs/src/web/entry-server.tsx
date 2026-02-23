/**
 * Server-side rendering entry point.
 * Used by the CLI's static renderer to generate pre-rendered HTML for each route.
 */

import { renderToString } from 'react-dom/server';
import { StrictMode } from 'react';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { AgentuityProvider } from '@agentuity/react';
import { ThemeProvider } from './components/ThemeContext';
import { routeTree } from './routeTree.gen';

// Re-export for automatic route discovery by the CLI static renderer.
// All non-parameterized routes are discovered automatically from the route tree.
export { routeTree };

export async function render(url: string): Promise<string> {
	const memoryHistory = createMemoryHistory({ initialEntries: [url] });
	const router = createRouter({
		routeTree,
		history: memoryHistory,
	});
	await router.load();

	return renderToString(
		<StrictMode>
			<ThemeProvider>
				<AgentuityProvider>
					<RouterProvider router={router} />
				</AgentuityProvider>
			</ThemeProvider>
		</StrictMode>
	);
}
