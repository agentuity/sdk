/**
 * Static Renderer
 *
 * When `src/web/entry-server.tsx` exists, this module:
 * 1. Runs a Vite SSR build (as a subprocess to avoid in-process Bun/Vite issues)
 * 2. Imports the built entry-server.js
 * 3. Discovers routes to pre-render:
 *    - If `routeTree` is exported: auto-discovers all non-parameterized routes
 *    - If `getStaticPaths()` is exported: merges those paths in (for parameterized routes)
 *    - If neither: throws an error
 * 4. Calls render(url) for each route
 * 5. Replaces <!--app-html--> in the client template with rendered HTML
 * 6. Writes pre-rendered HTML files to .agentuity/client/
 */

import { join } from 'node:path';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import type { Logger } from '../../../types';

/** Minimal shape of a TanStack Router route tree node. */
interface RouteTreeNode {
	path?: string;
	options?: { path?: string };
	children?: Record<string, RouteTreeNode>;
}

/**
 * Walks a TanStack Router route tree and extracts all non-parameterized paths.
 * Skips layout routes (no path) and parameterized routes (containing $).
 *
 * Accumulates the full URL path through the parent chain, since child routes
 * under layout routes have relative paths (e.g., '/key-value' under a
 * '/reference/api' layout should resolve to '/reference/api/key-value').
 */
function extractRoutePaths(node: RouteTreeNode): string[] {
	const paths = new Set<string>();

	function walk(route: RouteTreeNode, parentPath: string) {
		const segment: string | undefined = route.path ?? route.options?.path;

		// Build the full path by accumulating segments from parent routes.
		// - Layout routes have no path (undefined) and don't contribute to the URL.
		// - Index routes have path '/' and resolve to the parent path itself.
		// - Leaf/layout routes have paths like '/reference/api' or '/key-value'.
		let currentPath = parentPath;
		if (segment && segment !== '/') {
			// Non-root segment: append to parent path.
			// Segments always start with '/' (TanStack Router convention).
			currentPath = parentPath === '/' ? segment : parentPath + segment;
		}

		// Add non-parameterized, non-empty paths
		if (currentPath && !currentPath.includes('$')) {
			const normalized = currentPath === '/' ? '/' : currentPath.replace(/\/+$/, '');
			if (normalized) {
				paths.add(normalized);
			}
		}

		// Recurse into children, passing the accumulated path
		const children = route.children;
		if (children && typeof children === 'object') {
			for (const child of Object.values(children)) {
				if (child) walk(child, currentPath);
			}
		}
	}

	walk(node, '');
	return [...paths].sort();
}

export interface StaticRenderOptions {
	rootDir: string;
	logger: Logger;
	dev?: boolean;
}

export interface StaticRenderResult {
	routes: number;
	duration: number;
}

export async function runStaticRender(options: StaticRenderOptions): Promise<StaticRenderResult> {
	const { rootDir, logger, dev = false } = options;
	const started = Date.now();

	const clientDir = join(rootDir, '.agentuity/client');
	const ssrOutDir = join(rootDir, '.agentuity/ssr');
	const entryServerPath = join(rootDir, 'src/web/entry-server.tsx');
	const templatePath = join(clientDir, 'index.html');

	// Verify prerequisites
	if (!existsSync(entryServerPath)) {
		throw new Error(
			'Static rendering requires src/web/entry-server.tsx. ' +
				'This file must export a render(url: string) function and either ' +
				'a routeTree for auto-discovery or getStaticPaths() for explicit paths.'
		);
	}

	if (!existsSync(templatePath)) {
		throw new Error(
			'Client build must complete before static rendering. ' +
				'No index.html found in .agentuity/client/'
		);
	}

	// Step 1: Vite SSR build (subprocess)
	// Run as a subprocess to avoid in-process Bun/Vite module resolution issues
	// that cause @mdx-js/rollup and other plugins to fail during SSR builds.
	// This matches the approach used for client builds in vite-builder.ts.
	logger.debug('Running Vite SSR build for static rendering (subprocess)...');

	const buildMode = dev ? 'development' : 'production';

	const viteProcess = Bun.spawn(
		[
			'bun',
			'x',
			'vite',
			'build',
			'--ssr',
			entryServerPath,
			'--outDir',
			ssrOutDir,
			'--mode',
			buildMode,
		],
		{
			cwd: rootDir,
			stdout: 'inherit',
			stderr: 'inherit',
		}
	);

	const exitCode = await viteProcess.exited;

	if (exitCode !== 0) {
		throw new Error(`Vite SSR build exited with code ${exitCode}`);
	}

	// Steps 2–4: wrapped in try-finally so SSR artifacts are always cleaned up,
	// even if an exception is thrown during module import, validation, or rendering.
	let routeCount = 0;
	try {
		// Step 2: Import the built SSR entry
		const ssrEntryPath = join(ssrOutDir, 'entry-server.js');
		if (!existsSync(ssrEntryPath)) {
			throw new Error(`SSR build did not produce entry-server.js at ${ssrEntryPath}`);
		}

		const ssrModule = await import(ssrEntryPath);

		if (typeof ssrModule.render !== 'function') {
			throw new Error(
				'entry-server.tsx must export a render(url: string) function that returns HTML string'
			);
		}

		// Step 3: Discover routes
		// Priority: auto-discover from routeTree + merge getStaticPaths() if present
		const discovered = new Set<string>();

		// 3a. Auto-discover from exported routeTree (skips parameterized routes)
		if (ssrModule.routeTree) {
			const autoRoutes = extractRoutePaths(ssrModule.routeTree);
			for (const r of autoRoutes) {
				discovered.add(r);
			}
			logger.debug(`Auto-discovered ${autoRoutes.length} routes from route tree`);
		}

		// 3b. Merge paths from getStaticPaths() if exported (for parameterized routes, etc.)
		if (typeof ssrModule.getStaticPaths === 'function') {
			const extraRoutes = await ssrModule.getStaticPaths();
			if (!Array.isArray(extraRoutes)) {
				throw new Error(
					'getStaticPaths() must return an array of URL paths (e.g., ["/", "/about"])'
				);
			}
			for (const r of extraRoutes) {
				discovered.add(r);
			}
			logger.debug(`getStaticPaths() added ${extraRoutes.length} paths`);
		}

		// Must have at least one source of routes
		if (discovered.size === 0) {
			throw new Error(
				'No routes to pre-render. Export routeTree from entry-server.tsx for auto-discovery, ' +
					'or export getStaticPaths() returning an array of URL paths.'
			);
		}

		const routes: string[] = [...discovered].sort();
		routeCount = routes.length;
		logger.debug(`Total: ${routes.length} routes for pre-rendering`);

		// Step 4: Read template and pre-render each route
		const template = readFileSync(templatePath, 'utf-8');
		if (!template.includes('<!--app-html-->')) {
			logger.warn(
				'index.html is missing the <!--app-html--> placeholder; ' +
					'pre-rendered content will not be injected into the page.'
			);
		}

		for (const route of routes) {
			try {
				const html = await ssrModule.render(route);
				const page = template.replace('<!--app-html-->', html);

				let outPath: string;
				if (route === '/') {
					outPath = join(clientDir, 'index.html');
				} else {
					const dir = join(clientDir, route.slice(1));
					mkdirSync(dir, { recursive: true });
					outPath = join(dir, 'index.html');
				}

				writeFileSync(outPath, page, 'utf-8');
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				logger.warn(`Failed to render route ${route}: ${message}`);
				// Continue rendering other routes
			}
		}
	} finally {
		// Step 5: Clean up SSR build artifacts (always runs, even on error)
		rmSync(ssrOutDir, { recursive: true, force: true });
	}

	const duration = Date.now() - started;
	logger.debug(`Static rendering complete: ${routeCount} routes in ${duration}ms`);

	return { routes: routeCount, duration };
}
