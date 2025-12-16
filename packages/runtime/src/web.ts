import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

/**
 * Create a router that serves the web application.
 * In dev mode (DEV=true), serves HTML with Vite HMR scripts (@hono/vite-dev-server handles asset serving).
 * In production, serves static files from .agentuity/client/.
 */
export async function createWebRouter(): Promise<Hono> {
	const router = new Hono();
	const isDev = process.env.DEV === 'true';
	const rootDir = process.cwd();

	if (isDev) {
		// In dev mode, serve HTML with Vite client scripts for HMR
		// @hono/vite-dev-server middleware handles /src/* requests
		router.get('/', (c) => {
			return c.html(
				`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Agentuity App</title>
  </head>
  <body>
    <div id="root"></div>

    <script type="module" src="/@vite/client"></script>
    <script type="module">
      import RefreshRuntime from '/@react-refresh';
      RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {};
      window.$RefreshSig$ = () => (type) => type;
      window.__vite_plugin_react_preamble_installed__ = true;
    </script>

    <script type="module" src="/src/web/frontend.tsx"></script>
  </body>
</html>`
			);
		});
	} else {
		// Production: serve static files from .agentuity/client/
		const clientDir = join(rootDir, '.agentuity', 'client');

		// Verify client build exists
		const indexHtmlPath = join(clientDir, 'index.html');
		if (!existsSync(indexHtmlPath)) {
			throw new Error(
				`Client build not found. Missing ${indexHtmlPath}. Run build to generate client assets.`
			);
		}

		// Serve static files from .agentuity/client/
		router.use('/*', serveStatic({ root: clientDir }));

		// Fallback to index.html for SPA routing
		router.get('*', serveStatic({ path: join(clientDir, 'index.html') }));
	}

	return router;
}
