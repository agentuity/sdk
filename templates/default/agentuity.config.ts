/**
 * Agentuity Configuration
 *
 */

import type { AgentuityConfig } from '@agentuity/cli';
import react from '@vitejs/plugin-react';
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
	 * Plugins for the client build (src/web/).
	 * The React plugin is included by default — replace it with your
	 * framework of choice (e.g., @sveltejs/vite-plugin-svelte).
	 *
	 * @see https://vitejs.dev/plugins/
	 */
	plugins: [react(), tailwindcss()],
} satisfies AgentuityConfig;
