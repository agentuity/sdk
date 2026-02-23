/**
 * Static Renderer
 *
 * When `render: 'static'` is set in agentuity.config.ts, this module:
 * 1. Runs a Vite SSR build to create a server-side entry point
 * 2. Imports the built entry-server.js
 * 3. Calls getStaticPaths() to discover all routes
 * 4. Calls render(url) for each route
 * 5. Replaces <!--app-html--> in the client template with rendered HTML
 * 6. Writes pre-rendered HTML files to .agentuity/client/
 */

import { join } from 'node:path';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import type { Logger } from '../../../types';
import { hasFrameworkPlugin } from './config-loader';

export interface StaticRenderOptions {
	rootDir: string;
	logger: Logger;
	/** User plugins from agentuity.config.ts */
	userPlugins: import('vite').PluginOption[];
}

export interface StaticRenderResult {
	routes: number;
	duration: number;
}

export async function runStaticRender(options: StaticRenderOptions): Promise<StaticRenderResult> {
	const { rootDir, logger, userPlugins } = options;
	const started = Date.now();

	const clientDir = join(rootDir, '.agentuity/client');
	const ssrOutDir = join(rootDir, '.agentuity/ssr');
	const entryServerPath = join(rootDir, 'src/web/entry-server.tsx');
	const templatePath = join(clientDir, 'index.html');

	// Verify prerequisites
	if (!existsSync(entryServerPath)) {
		throw new Error(
			'Static rendering requires src/web/entry-server.tsx. ' +
				'This file must export render(url: string) and getStaticPaths() functions.'
		);
	}

	if (!existsSync(templatePath)) {
		throw new Error(
			'Client build must complete before static rendering. ' +
				'No index.html found in .agentuity/client/'
		);
	}

	// Step 1: Vite SSR build
	// This resolves import.meta.glob, MDX imports, and other Vite-specific APIs
	logger.debug('Running Vite SSR build for static rendering...');

	const projectRequire = createRequire(join(rootDir, 'package.json'));
	let vitePath = 'vite';
	let reactPluginPath = '@vitejs/plugin-react';
	try {
		vitePath = projectRequire.resolve('vite');
		reactPluginPath = projectRequire.resolve('@vitejs/plugin-react');
	} catch {
		// Use CLI's bundled version
	}

	const { build: viteBuild } = await import(vitePath);
	const reactModule = await import(reactPluginPath);
	const react = reactModule.default;

	// Build plugin list: auto-add React if no framework plugin present
	const plugins = [...(userPlugins || [])];
	if (plugins.length === 0 || !hasFrameworkPlugin(plugins)) {
		plugins.unshift(react());
	}

	await viteBuild({
		root: rootDir,
		plugins,
		build: {
			ssr: entryServerPath,
			outDir: ssrOutDir,
			rollupOptions: {
				output: {
					format: 'esm',
				},
			},
		},
		ssr: {
			// Bundle all dependencies for SSR — we need import.meta.glob, MDX, etc.
			// resolved at build time. Node built-ins are still externalized.
			noExternal: true,
		},
		logLevel: 'warn',
	});

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
		if (typeof ssrModule.getStaticPaths !== 'function') {
			throw new Error(
				'entry-server.tsx must export a getStaticPaths() function when using render: "static". ' +
					'It should return an array of URL paths (e.g., ["/", "/about", "/docs/intro"])'
			);
		}

		// Step 3: Discover routes
		const rawRoutes = await ssrModule.getStaticPaths();
		if (!Array.isArray(rawRoutes)) {
			throw new Error(
				'getStaticPaths() must return an array of URL paths (e.g., ["/", "/about"])'
			);
		}
		const routes: string[] = rawRoutes;
		routeCount = routes.length;
		logger.debug(`Discovered ${routes.length} routes for pre-rendering`);

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
