/**
 * Pre-render script for static site generation.
 *
 * Reads the built index.html template from .agentuity/client/,
 * imports the server entry point, renders each route to HTML,
 * and writes static HTML files for each route.
 *
 * Usage: bun run scripts/prerender.ts
 */

import { resolve, dirname } from 'node:path';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';

// All routes to pre-render
const ROUTES = [
	'/',
	'/hello',
	'/handler-context',
	'/key-value',
	'/vector-storage',
	'/object-storage',
	'/ai-gateway',
	'/streaming',
	'/sse-stream',
	'/durable-stream',
	'/agent-calls',
	'/cron',
	'/chat',
	'/model-arena',
	'/evals',
];

async function prerender() {
	const clientDir = resolve(import.meta.dir, '../.agentuity/client');
	const templatePath = resolve(clientDir, 'index.html');

	if (!existsSync(templatePath)) {
		console.error(`Template not found: ${templatePath}`);
		console.error('Run "bun run build" first to generate the client bundle.');
		process.exit(1);
	}

	const template = readFileSync(templatePath, 'utf-8');

	// Import the server entry — Bun handles TSX natively
	const { render } = await import('../src/web/entry-server.tsx');

	console.log(`Pre-rendering ${ROUTES.length} routes...`);

	for (const route of ROUTES) {
		const html = render(route);
		const page = template.replace('<!--app-html-->', html);

		let outPath: string;
		if (route === '/') {
			outPath = resolve(clientDir, 'index.html');
		} else {
			const dir = resolve(clientDir, route.slice(1));
			mkdirSync(dir, { recursive: true });
			outPath = resolve(dir, 'index.html');
		}

		writeFileSync(outPath, page, 'utf-8');
		console.log(`  ✓ ${route} → ${outPath.replace(clientDir, '.')}`);
	}

	console.log(`\nDone! ${ROUTES.length} pages pre-rendered.`);
}

prerender().catch((err) => {
	console.error('Pre-render failed:', err);
	process.exit(1);
});
