import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';
import { join, relative } from 'node:path';
import { existsSync } from 'node:fs';

/**
 * Create a router that serves the web application.
 * In dev mode (DEV=true), serves HTML with Vite HMR scripts (Bun server proxies assets to Vite).
 * In production, serves static files from .agentuity/client/.
 */
export async function createWebRouter(): Promise<Hono> {
	const router = new Hono();
	const isDev = process.env.DEV === 'true';
	const rootDir = process.cwd();

	if (isDev) {
		// In dev mode, serve HTML with Vite client scripts for HMR
		// Bun server proxies /src/*, /@vite/*, etc. to Vite asset server
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

		// Compute relative paths for serveStatic (it expects relative paths from cwd)
		let relClientDir = relative(process.cwd(), clientDir);
		if (!relClientDir.startsWith('.')) {
			relClientDir = './' + relClientDir;
		}
		let relIndexPath = relative(process.cwd(), indexHtmlPath);
		if (!relIndexPath.startsWith('.')) {
			relIndexPath = './' + relIndexPath;
		}

		// Extended MIME types for types Hono may not recognize
		const customMimes: Record<string, string> = {
			md: 'text/markdown',
			markdown: 'text/markdown',
			txt: 'text/plain',
			csv: 'text/csv',
			ics: 'text/calendar',
			vcf: 'text/vcard',
			yaml: 'text/yaml',
			yml: 'text/yaml',
			avif: 'image/avif',
			jxl: 'image/jxl',
			apng: 'image/apng',
			otf: 'font/otf',
			aac: 'audio/aac',
			flac: 'audio/flac',
			opus: 'audio/opus',
			m4a: 'audio/mp4',
			weba: 'audio/webm',
			mkv: 'video/x-matroska',
			mov: 'video/quicktime',
			doc: 'application/msword',
			docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
			xls: 'application/vnd.ms-excel',
			xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			ppt: 'application/vnd.ms-powerpoint',
			pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
			odt: 'application/vnd.oasis.opendocument.text',
			ods: 'application/vnd.oasis.opendocument.spreadsheet',
			odp: 'application/vnd.oasis.opendocument.presentation',
			rtf: 'application/rtf',
			webmanifest: 'application/manifest+json',
			wasm: 'application/wasm',
			glb: 'model/gltf-binary',
			gltf: 'model/gltf+json',
		};

		// Serve static files from .agentuity/client/
		router.use('/*', serveStatic({ root: relClientDir, mimes: customMimes }));

		// Fallback to index.html for SPA routing
		router.get('*', serveStatic({ path: relIndexPath, mimes: customMimes }));
	}

	return router;
}
