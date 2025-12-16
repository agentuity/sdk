/**
 * Agentuity Configuration
 *
 * Configure your Agentuity application with workbench settings and Vite plugins.
 *
 * @see https://agentuity.com/docs/configuration
 */

import type { AgentuityConfig } from '@agentuity/cli';

export default {
	/**
	 * Workbench Configuration (Development Mode Only)
	 *
	 * The workbench provides a visual UI for testing and interacting with your agents
	 * during local development. It is NOT included in production builds.
	 *
	 * To enable workbench:
	 * 1. Uncomment the workbench section below (presence = enabled)
	 * 2. Install @agentuity/workbench: bun add @agentuity/workbench
	 * 3. Run `agentuity dev` (workbench is dev-only)
	 * 4. Access at http://localhost:3500/workbench (or your configured route)
	 *
	 * To disable workbench: omit this entire section (absence = disabled)
	 */
	// workbench: {
	// 	route: '/workbench',       // URL path where workbench is served (optional)
	// 	headers: {},                // Optional custom headers
	// },
	/**
	 * Vite Plugins
	 *
	 * Add custom Vite plugins for client-side builds.
	 * These are applied AFTER Agentuity's built-in plugins.
	 *
	 * Example: Tailwind CSS
	 *
	 * 1. Install dependencies:
	 *    bun add -d tailwindcss @tailwindcss/vite
	 *
	 * 2. Import and add the plugin:
	 *    import tailwindcss from '@tailwindcss/vite';
	 *
	 * 3. Add to plugins array:
	 *    plugins: [tailwindcss()],
	 *
	 * @see https://vitejs.dev/plugins/
	 */
	// plugins: [],
} satisfies AgentuityConfig;
