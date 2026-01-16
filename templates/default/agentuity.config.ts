/**
 * Agentuity Configuration
 *
 */

import type { AgentuityConfig } from '@agentuity/cli';
import tailwindcss from '@tailwindcss/vite';

export default {
	/**
	 * Workbench (development only)
	 *
	 * Visual UI for testing agents during development. Not included in production builds.
	 * Omit this section to disable. Access at http://localhost:3500/workbench
	 */
	workbench: {
		route: '/workbench',
		headers: {},
	},

	/**
	 * Vite Plugins
	 *
	 * Custom Vite plugins for the client build (src/web/).
	 * Added after built-in plugins: React, browserEnvPlugin, patchPlugin
	 *
	 * Example (Tailwind CSS):
	 *   bun add -d tailwindcss @tailwindcss/vite
	 *   import tailwindcss from '@tailwindcss/vite';
	 *   plugins: [tailwindcss()]
	 *
	 * @see https://vitejs.dev/plugins/
	 */
	plugins: [tailwindcss()],
} satisfies AgentuityConfig;
