/**
 * Agentuity Vite plugin.
 *
 * Wires Vite's dev server up to a gravity public-URL tunnel that the
 * Agentuity CLI may be running. When `agentuity dev --public` is
 * active, the CLI exports `AGENTUITY_DEVMODE_HOSTNAME` (and
 * `AGENTUITY_DEVMODE_URL`) into the user's framework process.
 *
 * This plugin reads that hostname and:
 *
 *   1. Adds it to `server.allowedHosts` so Vite stops rejecting
 *      requests with "Blocked request. This host is not allowed."
 *   2. Configures `server.hmr` so the HMR WebSocket connects back
 *      through the tunnel using `wss://<hostname>:443`. Without this,
 *      the browser tries to dial Vite directly on the local port and
 *      HMR silently fails for users browsing the public URL.
 *
 * The plugin is a no-op when the env var is absent, so it's safe to
 * always include in `vite.config.ts`.
 */

import type { Plugin, UserConfig } from 'vite';

const ENV_HOSTNAME = 'AGENTUITY_DEVMODE_HOSTNAME';

export interface AgentuityVitePluginOptions {
	/**
	 * Override the hostname the plugin reacts to. When omitted, the
	 * plugin reads `process.env.AGENTUITY_DEVMODE_HOSTNAME`.
	 */
	hostname?: string;
}

/**
 * Vite plugin: enables Agentuity public-URL devmode (gravity tunnel).
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { defineConfig } from 'vite';
 * import agentuity from '@agentuity/vite';
 *
 * export default defineConfig({
 *   plugins: [agentuity()],
 * });
 * ```
 */
export default function agentuity(options: AgentuityVitePluginOptions = {}): Plugin {
	return {
		name: 'agentuity:devmode',
		// Only apply during dev. Production builds don't need this.
		apply: 'serve',
		config(): UserConfig | undefined {
			const hostname = options.hostname ?? process.env[ENV_HOSTNAME];
			if (!hostname) {
				return undefined;
			}
			return {
				server: {
					// Vite requires the hostname to be in this list — strings
					// are matched exactly, regex entries can broaden matches.
					allowedHosts: [hostname],
					// HMR comes in over the gravity TLS tunnel on port 443.
					// Without this Vite tells the browser to dial localhost
					// directly, which fails for clients hitting the public URL.
					hmr: {
						host: hostname,
						clientPort: 443,
						protocol: 'wss',
					},
				},
			};
		},
	};
}

export { agentuity };
