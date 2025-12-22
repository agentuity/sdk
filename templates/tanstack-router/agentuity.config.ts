/**
 * Agentuity Configuration - TanStack Router Template
 *
 * This configuration adds the TanStack Router Vite plugin for file-based routing.
 * Routes are discovered from src/web/routes/ and the route tree is generated
 * at src/web/routeTree.gen.ts.
 */

import { TanStackRouterVite } from '@tanstack/router-plugin/vite';
import type { AgentuityConfig } from '@agentuity/cli';

export default {
	plugins: [
		TanStackRouterVite({
			routesDirectory: './src/web/routes',
			generatedRouteTree: './src/web/routeTree.gen.ts',
			quoteStyle: 'single',
		}),
	],
} satisfies AgentuityConfig;
